<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;

/**
 * One page's promotion posts (spec 2026-10-20 §4.4): one AI call writes a post per slot, each from a different angle,
 * facts only from the page, in the brand's language and each platform's own form. Not final, so tests replace it.
 */
class PromotionWriter
{
    public const TEXT_CHARS = 8000;

    public const ANGLES = [
        'key takeaway', 'question', 'surprising fact from the page', 'how-to tip', 'myth vs fact', 'quote from the page',
        'checklist', 'mistake to avoid', 'story', 'behind the page', 'number from the page', 'poll', 'carousel outline',
        'short video script', 'recap',
    ];

    /** The calendar's post types (ContentCalendarGenerationService), so a promotion post reads like any other. */
    public const POST_TYPES = [
        'problem_aware', 'myth_busting', 'how_to', 'checklist', 'mistakes', 'comparison', 'story', 'before_after',
        'faq_answer', 'behind_the_scenes', 'case_study', 'soft_offer', 'founder_opinion', 'trend_reaction', 'poll_question',
        'carousel', 'video_script', 'product_demo',
    ];

    public function __construct(protected AiClient $ai, protected ContextBuilder $context)
    {
    }

    /**
     * @param array{url: string, title: string, description: ?string, published_at: ?string, text: string} $page
     * @param list<array{platform: string, date: string, time?: ?string}> $slots
     * @param list<string> $earlierHooks
     * @return list<array<string, mixed>|null>
     */
    public function write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): array
    {
        $prompt = self::prompt($page, $slots, (string) ($profile->default_language ?: 'en'), $this->context->build($profile), $earlierHooks, $instructions);

        return self::posts($this->ai->generateJson($profile, 'promotion', $prompt, 12000), $slots);
    }

    /**
     * @param array<string, mixed> $page
     * @param list<array{platform: string, date: string}> $slots
     * @param list<string> $earlierHooks
     */
    public static function prompt(array $page, array $slots, string $language, string $context, array $earlierHooks, ?string $instructions): string
    {
        $lines = [];
        $rules = [];
        foreach (array_values($slots) as $i => $slot) {
            $platform = (string) $slot['platform'];
            $lines[] = ($i + 1) . ". {$platform} — {$slot['date']}";
            $rules[$platform] ??= "- {$platform}: " . ContentPlatformRules::for($platform)
                . (in_array($platform, ContentPlatformRules::NO_LINKS, true)
                    ? ' Links cannot be clicked here: end the text by pointing readers to the link in bio.'
                    : ' Do not write the web address: the link is added on its own line after the text.');
        }
        $hooks = $earlierHooks === [] ? '' : "## HOOKS ALREADY USED FOR THIS PAGE (do not repeat them)\n- "
            . implode("\n- ", array_map(fn (string $hook) => mb_substr($hook, 0, 200), $earlierHooks)) . "\n\n";
        $extra = trim((string) $instructions) === '' ? '' : "## EXTRA INSTRUCTIONS FROM THE USER\n" . trim((string) $instructions) . "\n\n";
        $count = count($slots);

        return "You write social media posts that promote one page of the brand's own website.\n"
            . "Write {$count} posts, one for each slot below, in this order, in the language with the code \"{$language}\".\n"
            . 'Use only facts the page states: no invented numbers, prices, quotes or claims. Give each post a different angle, chosen from: '
            . implode(', ', self::ANGLES) . ".\n"
            . "Every post makes the reader want to open the page. A post on x keeps main_copy within 250 characters.\n\n"
            . "## THE BRAND\n{$context}\n\n"
            . "## THE PAGE\nAddress: {$page['url']}\nTitle: {$page['title']}\n"
            . (!empty($page['description']) ? "Description: {$page['description']}\n" : '')
            . (!empty($page['published_at']) ? "Published: {$page['published_at']}\n" : '')
            . "Text:\n" . mb_substr((string) ($page['text'] ?? ''), 0, self::TEXT_CHARS) . "\n\n"
            . "## SLOTS\n" . implode("\n", $lines) . "\n\n"
            . "## PLATFORM RULES\n" . implode("\n", $rules) . "\n\n"
            . $hooks . $extra
            . 'Allowed post_type values: ' . implode(', ', self::POST_TYPES) . "\n\n"
            . 'Return ONLY JSON: {"posts": [{"platform": "...", "angle": "...", "topic": "...", "hook": "...", "main_copy": "...", "short_copy": "...", "cta": "...", "hashtags": ["#..."], "post_type": "...", "visual_idea": "..."}]}';
    }

    /**
     * The answer for each slot, in order, cut to the columns; null where the AI gave neither a hook nor a text.
     *
     * @param array<string, mixed> $data
     * @param list<array{platform: string, date: string}> $slots
     * @return list<array<string, mixed>|null>
     */
    public static function posts(array $data, array $slots): array
    {
        $items = is_array($data['posts'] ?? null) && array_is_list($data['posts']) ? $data['posts'] : [];
        $out = [];
        foreach (array_values($slots) as $i => $slot) {
            $item = $items[$i] ?? null;
            $main = is_array($item) ? self::text($item['main_copy'] ?? null, null) : null;
            $hook = is_array($item) ? self::text($item['hook'] ?? null, 500) : null;
            if ($main === null && $hook === null) {
                $out[] = null;
                continue;
            }
            $type = self::text($item['post_type'] ?? null, 50);
            $tags = [];
            foreach ((array) ($item['hashtags'] ?? []) as $tag) {
                $tag = is_scalar($tag) ? mb_substr(trim((string) $tag), 0, 100) : '';
                if ($tag !== '' && count($tags) < 30) {
                    $tags[] = $tag;
                }
            }
            $out[] = [
                'platform'    => (string) $slot['platform'],
                'angle'       => self::text($item['angle'] ?? null, 60),
                'topic'       => self::text($item['topic'] ?? null, 255),
                'hook'        => $hook,
                'main_copy'   => $main,
                'short_copy'  => self::text($item['short_copy'] ?? null, 2000),
                'cta'         => self::text($item['cta'] ?? null, 255),
                'hashtags'    => $tags,
                'post_type'   => $type !== null && in_array($type, self::POST_TYPES, true) ? $type : null,
                'visual_idea' => self::text($item['visual_idea'] ?? null, 2000),
            ];
        }

        return $out;
    }

    private static function text(mixed $value, ?int $max): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return $max === null ? $value : mb_substr($value, 0, $max);
    }
}
