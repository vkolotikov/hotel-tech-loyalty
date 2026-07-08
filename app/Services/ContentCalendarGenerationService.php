<?php

namespace App\Services;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerVisualBrief;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Generates a strategic content calendar week by week.
 *
 * Chunks the requested range into calendar weeks (<=7-day windows) and asks the
 * AI for one structured JSON plan per chunk, feeding topics created in earlier
 * chunks back into the anti-repetition digest so later weeks stay fresh.
 */
class ContentCalendarGenerationService
{
    private const DEFAULT_RHYTHM = [
        'monday' => 'problem_insight',
        'tuesday' => 'educational',
        'wednesday' => 'proof',
        'thursday' => 'behind_the_scenes',
        'friday' => 'soft_conversion',
        'saturday' => 'community',
        'sunday' => 'reflection',
    ];

    public function __construct(
        protected AiClient $ai,
        protected ContextBuilder $contextBuilder,
    ) {}

    /**
     * Generate calendar posts for a date range.
     *
     * $opts: ['platforms' => [..]|null, 'fill_empty_only' => bool (default true), 'instructions' => string|null]
     *
     * @return array{created: array, skipped_dates: array, weeks_processed: int}
     */
    public function generate(ContentPlannerProfile $profile, string $startDate, string $endDate, array $opts = []): array
    {
        $start = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();

        if ($end->lt($start)) {
            throw new InvalidArgumentException('end_date must be on or after start_date.');
        }
        if ($start->diffInDays($end) > 62) {
            throw new InvalidArgumentException('Calendar generation range cannot exceed 62 days.');
        }

        $platformFilter = $opts['platforms'] ?? null;
        $fillEmptyOnly = array_key_exists('fill_empty_only', $opts) ? (bool) $opts['fill_empty_only'] : true;
        $instructions = isset($opts['instructions']) ? trim((string) $opts['instructions']) : '';

        $channels = $profile->channels()->active()->get();
        if (is_array($platformFilter) && count($platformFilter) > 0) {
            $wanted = array_map(fn ($p) => mb_strtolower(trim((string) $p)), $platformFilter);
            $channels = $channels
                ->filter(fn ($c) => in_array(mb_strtolower((string) $c->platform), $wanted, true))
                ->values();
        }
        if ($channels->isEmpty()) {
            throw new \RuntimeException('No active channels to plan for. Activate at least one social channel first.');
        }

        $activePlatforms = $channels
            ->pluck('platform')
            ->map(fn ($p) => mb_strtolower((string) $p))
            ->unique()
            ->values()
            ->all();

        $pillars = $profile->pillars()->active()->get();
        $audiences = $profile->audiences()->active()->get();
        $strategy = $profile->strategies()->active()->recent()->first();

        $context = $this->contextBuilder->build($profile);
        $digest = $this->contextBuilder->recentPostsDigest($profile);

        // Existing (non-archived) posts across the whole range → occupied slots + per-window listing.
        $existingPosts = ContentPlannerPost::where('planner_profile_id', $profile->id)
            ->whereBetween('scheduled_date', [$start->toDateString(), $end->toDateString()])
            ->where('status', '!=', 'archived')
            ->get(['id', 'scheduled_date', 'platform', 'topic']);

        $occupied = [];
        foreach ($existingPosts as $existing) {
            $date = $existing->scheduled_date?->format('Y-m-d');
            if ($date) {
                $occupied[$date . '|' . mb_strtolower((string) $existing->platform)] = true;
            }
        }

        $created = [];
        $skipped = [];
        $newDigestLines = [];
        $weeksProcessed = 0;
        $chunkErrors = [];

        $cursor = $start->copy();
        while ($cursor->lte($end)) {
            $chunkEnd = $cursor->copy()->endOfWeek(Carbon::SUNDAY)->startOfDay();
            if ($chunkEnd->gt($end)) {
                $chunkEnd = $end->copy();
            }

            $windowScheduledLines = $existingPosts
                ->filter(function ($p) use ($cursor, $chunkEnd) {
                    $date = $p->scheduled_date;

                    return $date && $date->gte($cursor) && $date->lte($chunkEnd);
                })
                ->map(fn ($p) => sprintf(
                    '- %s [%s] %s',
                    $p->scheduled_date->format('Y-m-d'),
                    mb_strtolower((string) $p->platform),
                    (string) $p->topic
                ))
                ->implode("\n");

            $digestBlock = $digest;
            if (!empty($newDigestLines)) {
                if (trim($digestBlock) === '') {
                    $digestBlock = 'RECENT CONTENT (do NOT repeat these topics/hooks/angles):';
                }
                $digestBlock .= "\n" . implode("\n", $newDigestLines);
            }

            $prompt = $this->buildChunkPrompt(
                $profile,
                $channels,
                $pillars,
                $audiences,
                $cursor,
                $chunkEnd,
                $context,
                $digestBlock,
                $windowScheduledLines,
                $fillEmptyOnly,
                $instructions,
                $activePlatforms
            );

            try {
                $result = $this->ai->generateJson($profile, 'calendar', $prompt, 16000);
            } catch (\Throwable $e) {
                Log::error(sprintf(
                    'Content calendar chunk failed (%s to %s): %s',
                    $cursor->toDateString(),
                    $chunkEnd->toDateString(),
                    $e->getMessage()
                ));
                $chunkErrors[] = $e->getMessage();
                $weeksProcessed++;
                $cursor = $chunkEnd->copy()->addDay();
                continue;
            }

            $items = is_array($result['items'] ?? null) ? $result['items'] : [];

            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }

                $dateRaw = $item['date'] ?? null;
                $date = null;
                if ($dateRaw !== null && $dateRaw !== '') {
                    try {
                        $date = Carbon::parse((string) $dateRaw)->startOfDay();
                    } catch (\Throwable) {
                        $date = null;
                    }
                }
                $platform = mb_strtolower(trim((string) ($item['platform'] ?? '')));

                if (!$date || $date->lt($cursor) || $date->gt($chunkEnd)) {
                    $skipped[] = [
                        'date' => (string) $dateRaw,
                        'platform' => $platform,
                        'reason' => 'date_outside_window',
                    ];
                    continue;
                }
                if (!in_array($platform, $activePlatforms, true)) {
                    $skipped[] = [
                        'date' => $date->toDateString(),
                        'platform' => $platform,
                        'reason' => 'inactive_platform',
                    ];
                    continue;
                }

                $slotKey = $date->toDateString() . '|' . $platform;
                if ($fillEmptyOnly && isset($occupied[$slotKey])) {
                    $skipped[] = [
                        'date' => $date->toDateString(),
                        'platform' => $platform,
                        'reason' => 'slot_already_filled',
                    ];
                    continue;
                }

                $topic = $this->str($item['topic'] ?? null) ?? 'Untitled post';
                $hook = $this->str($item['hook'] ?? null);
                $reason = $this->str($item['strategic_reason'] ?? null);
                $time = $this->str($item['time'] ?? null);
                if ($time !== null && preg_match('/^([01]\d|2[0-3]):[0-5]\d/', $time)) {
                    $time = substr($time, 0, 5);
                } else {
                    $time = null;
                }
                $hashtags = array_values(array_filter(
                    array_map(fn ($t) => trim((string) $t), (array) ($item['hashtags'] ?? [])),
                    fn ($t) => $t !== ''
                ));
                $mechanic = is_array($item['engagement_mechanic'] ?? null) ? $item['engagement_mechanic'] : null;

                // Clamp AI strings to their varchar limits and isolate each
                // item: one malformed row must not abort the whole run after
                // the paid AI call.
                try {
                    $post = ContentPlannerPost::create([
                        'organization_id' => $profile->organization_id,
                        'brand_id' => $profile->brand_id,
                        'planner_profile_id' => $profile->id,
                        'strategy_id' => $strategy?->id,
                        'pillar_id' => $this->matchByName($pillars, $this->str($item['pillar'] ?? null)),
                        'audience_id' => $this->matchByName($audiences, $this->str($item['audience'] ?? null)),
                        'platform' => mb_substr($platform, 0, 50),
                        'scheduled_date' => $date->toDateString(),
                        'scheduled_time' => $time,
                        'language' => $profile->default_language ?: 'en',
                        'topic' => mb_substr($topic, 0, 255),
                        'hook' => $hook !== null ? mb_substr($hook, 0, 500) : null,
                        'cta' => $this->strMax($item['cta'] ?? null, 255),
                        'hashtags' => $hashtags,
                        'weekday_role' => $this->strMax($item['weekday_role'] ?? null, 50),
                        'funnel_stage' => $this->strMax($item['funnel_stage'] ?? null, 50),
                        'post_type' => $this->strMax($item['post_type'] ?? null, 50),
                        'strategic_reason' => $reason,
                        'engagement_mechanic' => $mechanic,
                        'status' => 'draft',
                        'generated_by' => 'calendar',
                        'main_copy' => $this->str($item['draft_copy'] ?? null),
                        'goal' => $reason !== null ? mb_substr($reason, 0, 250) : null,
                        'created_by' => auth()->id(),
                    ]);

                    $visualIdea = $this->str($item['visual_idea'] ?? null);
                    if ($visualIdea !== null) {
                        ContentPlannerVisualBrief::updateOrCreate(
                            ['post_id' => $post->id],
                            ['description' => $visualIdea]
                        );
                    }
                } catch (\Throwable $e) {
                    Log::warning('Calendar item insert failed: ' . $e->getMessage(), [
                        'profile_id' => $profile->id,
                        'date' => $date->toDateString(),
                        'platform' => $platform,
                    ]);
                    $skipped[] = [
                        'date' => $date->toDateString(),
                        'platform' => $platform,
                        'reason' => 'invalid_item',
                    ];
                    continue;
                }

                $occupied[$slotKey] = true;
                $created[] = $post;
                $newDigestLines[] = sprintf('- [%s] %s | %s', $platform, $topic, $hook ?? '');
            }

            $weeksProcessed++;
            $cursor = $chunkEnd->copy()->addDay();
        }

        if (empty($created) && !empty($chunkErrors)) {
            throw new \RuntimeException('Calendar generation failed: ' . $chunkErrors[0]);
        }

        return [
            'created' => $created,
            'skipped_dates' => $skipped,
            'weeks_processed' => $weeksProcessed,
        ];
    }

    /**
     * Build the master calendar prompt (spec §16) for one weekly chunk.
     */
    private function buildChunkPrompt(
        ContentPlannerProfile $profile,
        $channels,
        $pillars,
        $audiences,
        Carbon $windowStart,
        Carbon $windowEnd,
        string $context,
        string $digestBlock,
        string $windowScheduledLines,
        bool $fillEmptyOnly,
        string $instructions,
        array $activePlatforms
    ): string {
        $channelLines = $channels->map(function ($channel) {
            $days = collect((array) ($channel->frequency ?? []))
                ->filter(fn ($v) => (bool) $v)
                ->keys()
                ->implode(', ');

            return sprintf(
                '- %s: %s posts/week; preferred days: %s; role: %s',
                mb_strtolower((string) $channel->platform),
                $channel->posts_per_week !== null ? $channel->posts_per_week : 'flexible',
                $days !== '' ? $days : 'any',
                $channel->role ?: ($channel->goal ?: 'n/a')
            );
        })->implode("\n");

        $rhythm = (array) ($profile->weekly_rhythm ?? []);
        if (empty($rhythm)) {
            $rhythm = self::DEFAULT_RHYTHM;
        }
        $rhythmLines = [];
        foreach ($rhythm as $day => $conf) {
            $role = is_array($conf) ? (string) ($conf['role'] ?? '') : (string) $conf;
            $notes = is_array($conf) ? (string) ($conf['notes'] ?? '') : '';
            $rhythmLines[] = '- ' . $day . ': ' . $role . ($notes !== '' ? ' — ' . $notes : '');
        }
        $rhythmBlock = implode("\n", $rhythmLines);

        $mixLines = [];
        foreach ((array) ($profile->content_mix ?? []) as $category => $percent) {
            $mixLines[] = sprintf('- %s: %s%%', $category, $percent);
        }
        $mixBlock = !empty($mixLines)
            ? implode("\n", $mixLines)
            : '- No explicit mix configured — balance education, trust and light promotion (max ~20% promotional).';

        $pillarLines = $pillars->map(fn ($p) => sprintf(
            '- %s (weight %s%%): %s',
            $p->name,
            $p->frequency_weight ?? 0,
            (string) ($p->purpose ?: $p->description)
        ))->implode("\n");
        if ($pillarLines === '') {
            $pillarLines = '- No pillars defined yet — derive sensible themes from the brand profile.';
        }

        $audienceLines = $audiences->map(fn ($a) => sprintf(
            '- %s%s',
            $a->name,
            $a->job_role ? ' (' . $a->job_role . ')' : ''
        ))->implode("\n");
        if ($audienceLines === '') {
            $audienceLines = '- No audience segments defined — target the general audience from the brand profile.';
        }

        if ($windowScheduledLines !== '') {
            $scheduledBlock = $fillEmptyOnly
                ? "## ALREADY SCHEDULED IN THIS WINDOW (these date+platform slots are TAKEN — do NOT create posts for them; fill ONLY the remaining empty slots)\n" . $windowScheduledLines
                : "## ALREADY SCHEDULED IN THIS WINDOW (avoid repeating these topics)\n" . $windowScheduledLines;
        } else {
            $scheduledBlock = "## ALREADY SCHEDULED IN THIS WINDOW\nNone — all slots are empty.";
        }

        $instructionsBlock = $instructions !== ''
            ? "## EXTRA INSTRUCTIONS FROM THE USER\n" . $instructions
            : '';

        $platformList = implode(', ', $activePlatforms);
        $windowStartStr = $windowStart->toDateString();
        $windowEndStr = $windowEnd->toDateString();

        return <<<PROMPT
You are an expert social media calendar strategist.

Create a content calendar for the brand below using the approved strategy, platform settings, weekly rhythm, audience segments, content pillars, and previous content history. Do not fill dates randomly.

GOLDEN RULES: Audience first, brand second, promotion third. Never start posts with "We offer". No invented stats or testimonials. One post = one idea.

{$context}

{$digestBlock}

## PLANNING WINDOW
Plan posts ONLY for dates from {$windowStartStr} to {$windowEndStr} (inclusive). Dates outside this window will be rejected.

## ACTIVE CHANNELS & POSTING FREQUENCY (only these platforms are allowed; respect days and posts per week)
{$channelLines}

## WEEKLY RHYTHM (weekday roles to follow)
{$rhythmBlock}

## CONTENT MIX TARGETS (distribute post types accordingly)
{$mixBlock}

## CONTENT PILLARS (use the pillar name EXACTLY as written)
{$pillarLines}

## AUDIENCE SEGMENTS (use the audience name EXACTLY as written)
{$audienceLines}

{$scheduledBlock}

{$instructionsBlock}

For every post decide:
- why this post should exist (strategic_reason)
- which audience it serves
- which content pillar it supports
- which funnel stage it belongs to
- why this platform is suitable
- what engagement action it should create
- what visual is required
- how it connects to the USP, values, or brand narrative

Avoid repetition from previous posts. Avoid too many promotional posts. Do not use the same hook style repeatedly. Use platform-native formats and adapt the same theme differently per platform. Balance low-promotion/high-value content.

Allowed values:
- platform: {$platformList}
- weekday_role: problem_insight, educational, proof, behind_the_scenes, soft_conversion, community, reflection
- funnel_stage: awareness, consideration, conversion, retention
- post_type: problem_aware, myth_busting, how_to, checklist, mistakes, comparison, story, before_after, faq_answer, behind_the_scenes, case_study, soft_offer, founder_opinion, trend_reaction, poll_question, carousel, video_script, product_demo
- engagement_mechanic.type: comments, saves, shares, dms, profile_visits, link_clicks, demo_requests, trial_signups, bookings, email_replies

Return ONLY valid JSON wrapped in ```json fences, exactly this shape:
```json
{"items":[{"date":"YYYY-MM-DD","time":"HH:MM","weekday_role":"educational","platform":"linkedin","pillar":"<pillar name>","audience":"<audience name>","funnel_stage":"awareness","post_type":"how_to","topic":"...","strategic_reason":"...","hook":"...","draft_copy":"...","cta":"...","hashtags":["#example"],"visual_idea":"...","engagement_mechanic":{"type":"comments","instruction":"..."}}]}
```
PROMPT;
    }

    /**
     * Case-insensitive name → id match: exact first, then contains (either direction).
     */
    private function matchByName($items, ?string $name): ?int
    {
        if ($name === null) {
            return null;
        }
        $needle = mb_strtolower(trim($name));
        if ($needle === '') {
            return null;
        }

        foreach ($items as $item) {
            if (mb_strtolower(trim((string) $item->name)) === $needle) {
                return $item->id;
            }
        }
        foreach ($items as $item) {
            $candidate = mb_strtolower(trim((string) $item->name));
            if ($candidate !== '' && (str_contains($candidate, $needle) || str_contains($needle, $candidate))) {
                return $item->id;
            }
        }

        return null;
    }

    /**
     * Coerce an AI-returned value into a trimmed string or null.
     */
    private function str(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_array($value)) {
            $value = json_encode($value);
        }
        $value = trim((string) $value);

        return $value !== '' ? $value : null;
    }

    /**
     * Like str() but clamped to a varchar column limit.
     */
    private function strMax(mixed $value, int $max): ?string
    {
        $s = $this->str($value);

        return $s !== null ? mb_substr($s, 0, $max) : null;
    }
}
