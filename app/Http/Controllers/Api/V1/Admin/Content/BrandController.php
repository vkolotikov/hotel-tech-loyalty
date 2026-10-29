<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerSnippet;
use App\Models\Organization;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentBrandEditor;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentRules;
use App\Services\Content\ContentSnippetSuggester;
use App\Services\Content\ContentTemplates;
use App\Services\Content\Days\HolidayCountry;
use App\Services\ContentKnowledgeService;
use App\Services\ContentPlanner\ProfileBootstrapService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Support\SharedCache;

/**
 * Brand (spec 2026-10-14 §4.6): everyone reads the profile, its audiences,
 * channels, voice and readiness; managers change them one section at a time,
 * set a new brand up (quick, with AI, or guided, section by section) and read
 * the organisation's knowledge again.
 */
class BrandController extends Controller
{
    public function __construct(private ContentBrandEditor $editor, private ContentKnowledgeService $knowledge)
    {
    }

    public function show(): JsonResponse
    {
        return response()->json($this->payload(ContentContext::profile()));
    }

    public function saveProfile(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $this->editor->saveProfile($profile, $request->validate(ContentRules::profileFields()));

        return response()->json($this->payload($profile->fresh()));
    }

    public function saveVoice(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $this->editor->saveVoice($profile, $request->validate(ContentRules::voiceFields()));

        return response()->json($this->payload($profile->fresh()));
    }

    public function storeAudience(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $audience = $this->editor->createAudience($profile, $request->validate(ContentRules::audienceFields(true)));

        return response()->json(['audience' => $this->audience($audience)] + $this->payload($profile->fresh()), 201);
    }

    public function updateAudience(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $audience = $this->findAudience($profile, $id);
        $this->editor->updateAudience($profile, $audience, $request->validate(ContentRules::audienceFields(false)));

        return response()->json(['audience' => $this->audience($audience->fresh())] + $this->payload($profile->fresh()));
    }

    /** Removing an audience posts use asks first (spec §7, F1): without ?confirm=1 it answers how many. */
    public function destroyAudience(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $audience = $this->findAudience($profile, $id);
        $inUse = ContentPlannerPost::where('audience_id', $audience->id)->count();
        if ($inUse > 0 && !$request->boolean('confirm')) {
            throw new ContentRefused('audience_in_use', "{$inUse} posts use this audience; they keep everything else.", 409, ['posts' => $inUse]);
        }
        $this->editor->deleteAudience($profile, $audience);

        return response()->json($this->payload($profile->fresh()));
    }

    public function storeChannel(Request $request): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $channel = $this->editor->createChannel($profile, $request->validate(ContentRules::channelFields(true)));

        return response()->json(['channel' => $this->channel($channel)] + $this->payload($profile->fresh()), 201);
    }

    public function updateChannel(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $channel = $this->findChannel($profile, $id);
        $this->editor->updateChannel($profile, $channel, $request->validate(ContentRules::channelFields(false)));

        return response()->json(['channel' => $this->channel($channel->fresh())] + $this->payload($profile->fresh()));
    }

    public function destroyChannel(Request $request, int $id): JsonResponse
    {
        $profile = $this->managerProfile($request);
        $this->editor->deleteChannel($profile, $this->findChannel($profile, $id));

        return response()->json($this->payload($profile->fresh()));
    }

    /** One AI call builds an empty brand's profile from the organisation's knowledge (spec §4.6). */
    public function quickSetup(Request $request, ContentAiGate $gate, ProfileBootstrapService $bootstrap): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $input = $request->validate([
            'name'             => 'nullable|string|max:255',
            'default_language' => 'nullable|string|max:10',
            'primary_goal'     => 'nullable|string|max:500',
            'platforms'        => 'required|array|min:1',
            'platforms.*'      => ['string', \Illuminate\Validation\Rule::in(ContentRules::PLATFORMS)],
            'intensity'        => 'nullable|string|in:light,standard,active',
        ]);
        if (ContentContext::profile()?->setup_completed_at !== null) {
            throw new ContentRefused('already_set_up', 'This brand is already set up — change it section by section.', 409);
        }
        $gate->allow($request->attributes->get('workspace_org'));
        // The AI log needs a profile row, so the shell comes first.
        $profile = $this->editor->profileFor($request->attributes->get('workspace_org'), $request->user());
        // One quick setup at a time per brand: a second click while the AI writes would pay twice.
        $lock = SharedCache::store()->lock("content:quick-setup:{$request->attributes->get('workspace_org')->id}:{$profile->brand_id}", 600);
        if (!$lock->get()) {
            throw new ContentRefused('already_generating', 'This brand is already being set up.', 409);
        }
        // A run that finished while this request waited must not be paid for twice.
        try {
            $this->editor->refuseIfSetUp($profile);
        } catch (ContentRefused $e) {
            $lock->release();
            throw $e;
        }

        set_time_limit(600);
        try {
            try {
                $result = $bootstrap->bootstrap($profile, $input);
            } catch (\Throwable $e) {
                report($e);
                throw new ContentRefused('ai_failed', 'Quick setup could not finish. Please try again.', 502);
            }
            $this->editor->applyPayload($profile, (array) ($result['payload'] ?? []), $input);
        } finally {
            $lock->release();
        }

        return response()->json(['assumptions' => array_values((array) ($result['assumptions'] ?? []))] + $this->payload($profile->fresh()), 201);
    }

    /** Guided setup's last step: every section was saved on its own; this marks the brand set up. */
    public function finishSetup(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        if ($profile->setup_completed_at === null) {
            $profile->forceFill(['setup_completed_at' => now()])->save();
        }
        $this->knowledge->readinessFor($profile);

        return response()->json($this->payload($profile->fresh()));
    }

    public function refreshKnowledge(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $summary = $this->knowledge->summarizeForAi((int) $profile->organization_id, (int) $profile->brand_id);
        $profile->update([
            'knowledge_summary_long'  => $summary,
            'knowledge_summary_short' => $summary,
            'last_knowledge_sync_at'  => now(),
        ]);
        $this->knowledge->readinessFor($profile);

        return response()->json($this->payload($profile->fresh()));
    }

    /** A hashtag group or snippet (spec 2026-10-15 §6): managers keep them, at most 50 of each kind per brand. */
    public function storeSnippet(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $data = $request->validate(ContentRules::snippetFields(true));
        if ($profile->snippets()->where('kind', $data['kind'])->count() >= ContentPlannerSnippet::MAX_PER_KIND) {
            throw new ContentRefused('too_many_snippets', 'A brand keeps at most ' . ContentPlannerSnippet::MAX_PER_KIND . ' of each.', 422);
        }
        $snippet = $profile->snippets()->create($data + [
            'brand_id'   => $profile->brand_id,
            'sort_order' => (int) $profile->snippets()->max('sort_order') + 1,
        ]);

        return response()->json(['snippet' => $this->snippet($snippet)] + $this->payload($profile->fresh()), 201);
    }

    /** Hashtag groups the AI proposes for this brand (spec 2026-10-15 §6): suggestions only, nothing is saved. */
    public function suggestSnippets(Request $request, ContentAiGate $gate, ContentSnippetSuggester $suggester): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $gate->allow($request->attributes->get('workspace_org'));
        $profile = ContentContext::requireProfile();
        set_time_limit(120);
        try {
            $suggestions = $suggester->suggest($profile);
        } catch (ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            report($e);
            // The provider's own words stay in the log.
            throw new ContentRefused('ai_failed', 'The AI could not finish this. Please try again.', 502);
        }

        return response()->json(['suggestions' => $suggestions]);
    }

    public function updateSnippet(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $snippet = $this->findSnippet($profile, $id);
        $snippet->fill($request->validate(ContentRules::snippetFields(false)))->save();

        return response()->json(['snippet' => $this->snippet($snippet->fresh())] + $this->payload($profile->fresh()));
    }

    public function destroySnippet(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $this->findSnippet($profile, $id)->delete();

        return response()->json($this->payload($profile->fresh()));
    }

    /** A manager writing a section: the brand's profile, made on the first save. */
    private function managerProfile(Request $request): ContentPlannerProfile
    {
        ContentAccess::requireManager($request->user());

        return $this->editor->profileFor($request->attributes->get('workspace_org'), $request->user());
    }

    private function findAudience(ContentPlannerProfile $profile, int $id): ContentPlannerAudience
    {
        return $profile->audiences()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This audience no longer exists.', 404);
    }

    private function findChannel(ContentPlannerProfile $profile, int $id): ContentPlannerChannel
    {
        return $profile->channels()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This channel no longer exists.', 404);
    }

    private function findSnippet(ContentPlannerProfile $profile, int $id): ContentPlannerSnippet
    {
        return $profile->snippets()->where('id', $id)->first()
            ?? throw new ContentRefused('not_found', 'This item no longer exists.', 404);
    }

    /** @return array{id: int, kind: string, name: string, body: string} */
    private function snippet(ContentPlannerSnippet $snippet): array
    {
        return ['id' => (int) $snippet->id, 'kind' => (string) $snippet->kind, 'name' => (string) $snippet->name, 'body' => (string) $snippet->body];
    }

    /** @return array<string, mixed> */
    private function payload(?ContentPlannerProfile $profile): array
    {
        // The country the venue suggests, for the Key dates section's "guessed" line (spec 2026-10-16 §3.3).
        $guess = ($org = Organization::find(ContentContext::orgId())) ? HolidayCountry::guess($org) : null;
        if (!$profile) {
            return ['profile' => null, 'audiences' => [], 'channels' => [], 'snippets' => [], 'templates' => [], 'voice' => null, 'readiness' => null, 'holiday_country_guess' => $guess];
        }
        $voice = $profile->brandVoices()->where('active', true)->first();

        return [
            'profile'   => $profile->only([
                'id', 'name', 'default_language', 'default_tone', 'primary_goal', 'secondary_goals', 'content_rules',
                'brand_summary', 'usp', 'mission', 'brand_values', 'brand_promise', 'differentiators', 'proof_points',
                'price_position', 'main_cta', 'important_links', 'positioning', 'key_messages', 'content_mix',
                'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode', 'setup_step', 'knowledge_score',
            ]) + [
                'setup_completed_at'     => $profile->setup_completed_at?->toISOString(),
                'last_knowledge_sync_at' => $profile->last_knowledge_sync_at?->toISOString(),
                'holiday_country'        => $profile->holiday_country,
                'marketing_days'         => (bool) ($profile->marketing_days ?? true),
                'requires_approval'      => (bool) ($profile->requires_approval ?? false),
            ],
            'audiences' => $profile->audiences()->where('active', true)->withCount('posts')->orderBy('id')->get()
                ->map(fn (ContentPlannerAudience $a) => $this->audience($a))->values()->all(),
            'channels'  => $profile->channels()->orderBy('id')->get()->map(fn (ContentPlannerChannel $c) => $this->channel($c))->values()->all(),
            // Hashtag groups first, then text snippets ('hashtags' sorts before 'text'), each in the order made.
            'snippets'  => $profile->snippets()->orderBy('kind')->orderBy('sort_order')->orderBy('id')->get()
                ->map(fn (ContentPlannerSnippet $s) => $this->snippet($s))->values()->all(),
            'templates' => ContentTemplates::list($profile),
            'voice'     => $voice ? $voice->only(['id', 'tone', 'style', 'formality_level', 'emoji_policy', 'hashtag_policy', 'sentence_style', 'point_of_view', 'preferred_words', 'forbidden_words', 'claims_to_avoid', 'example_good_posts', 'example_bad_posts']) : null,
            'readiness' => $this->knowledge->readinessOf($profile),
            'holiday_country_guess' => $guess,
        ];
    }

    /** @return array<string, mixed> */
    private function audience(ContentPlannerAudience $audience): array
    {
        return $audience->only(['id', 'name', 'description', 'industry', 'country', 'business_size', 'job_role', 'preferred_tone', 'language', 'pain_points', 'goals', 'fears', 'objections', 'buying_triggers', 'emotional_triggers', 'rational_triggers', 'questions', 'preferred_platforms', 'content_they_trust', 'desired_transformation', 'is_ai_assumed'])
            + ['posts_count' => (int) ($audience->posts_count ?? ContentPlannerPost::where('audience_id', $audience->id)->count())];
    }

    /** @return array<string, mixed> */
    private function channel(ContentPlannerChannel $channel): array
    {
        return $channel->only(['id', 'platform', 'label', 'url', 'goal', 'role', 'cta_style', 'visual_style', 'link_policy', 'tone_override', 'default_language', 'emoji_policy', 'hashtag_policy', 'posts_per_week', 'preferred_formats', 'frequency', 'audience_id', 'active', 'post_time']);
    }
}
