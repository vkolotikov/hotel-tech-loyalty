<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContentPlannerProfile;
use App\Models\Brand;
use App\Models\Organization;
use App\Services\ContentKnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Content Planner Profile Setup & Management
 *
 * Endpoints:
 *   GET    /v1/admin/content-planner/profile                        — get current profile (or onboarding state)
 *   POST   /v1/admin/content-planner/profile                        — create/replace profile from setup wizard
 *   GET    /v1/admin/content-planner/profile/readiness              — readiness score only
 *   PUT    /v1/admin/content-planner/profile/{id}                   — partial update of profile fields
 *   POST   /v1/admin/content-planner/profile/{id}/refresh-knowledge — re-sync FAQ/KB knowledge summary
 */
class ContentPlannerProfileController extends Controller
{
    public function __construct(
        protected ContentKnowledgeService $knowledgeService
    ) {}

    /**
     * Get or detect onboarding state for the current brand.
     *
     * Returns:
     *   - { exists: true, profile: {...}, readiness: {...} } if planner already setup
     *   - { exists: false, detected_knowledge: {...} } if needs setup
     */
    public function show(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'User has no organization'], 403);
        }
        $org = Organization::find($orgId);
        $brandId = Brand::currentOrDefaultIdForOrg($org->id);

        // If no default brand exists, use the first brand for the org
        if (!$brandId) {
            $brandId = Brand::where('organization_id', $org->id)->value('id');
        }

        // If still no brand, return empty state
        if (!$brandId) {
            return response()->json([
                'exists' => false,
                'error' => 'Organization has no brands configured',
            ]);
        }

        $profile = ContentPlannerProfile::where('organization_id', $org->id)
            ->where('brand_id', $brandId)
            ->with([
                'audiences' => fn ($q) => $q->where('active', true),
                'channels',
                'brandVoices' => fn ($q) => $q->where('active', true),
                'pillars' => fn ($q) => $q->where('active', true),
            ])
            ->first();

        if ($profile) {
            return response()->json([
                'exists' => true,
                'profile' => $profile,
                'readiness' => $this->knowledgeService->readinessFor($profile),
            ]);
        }

        // Onboarding: detect existing knowledge
        $detectedKnowledge = $this->knowledgeService->buildForBrand($org->id, $brandId);

        return response()->json([
            'exists' => false,
            'detected_knowledge' => $detectedKnowledge,
        ]);
    }

    /**
     * Create or replace the Content Planner profile from the full setup wizard payload.
     * Replaces audiences / channels / brand voice rows (posts keep working — FKs are nullOnDelete).
     */
    public function store(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'User has no organization'], 403);
        }
        $org = Organization::find($orgId);
        $brandId = Brand::currentOrDefaultIdForOrg($org->id);

        // If no default brand exists, use the first brand for the org
        if (!$brandId) {
            $brandId = Brand::where('organization_id', $org->id)->value('id');
        }

        // If still no brand, return error
        if (!$brandId) {
            return response()->json(['error' => 'Organization has no brands configured'], 422);
        }

        $validated = $request->validate($this->profileRules() + [
            'use_existing_knowledge' => 'nullable|boolean',
            'brand_voice' => 'nullable|array',
            'audiences' => 'nullable|array',
            'channels' => 'nullable|array',
        ]);

        // Get knowledge summary if using existing sources
        $summary = null;
        if ($request->boolean('use_existing_knowledge')) {
            $summary = $this->knowledgeService->summarizeForAi($org->id, $brandId);
        }

        $profileAttrs = [
            'name' => $validated['name'] ?? ($org->name . ' Content Planner'),
            'default_language' => $validated['default_language'] ?? 'en',
            'default_tone' => $validated['default_tone'] ?? 'professional',
            'primary_goal' => $validated['primary_goal'] ?? null,
            'secondary_goals' => $validated['secondary_goals'] ?? [],
            'knowledge_sources' => $validated['knowledge_sources'] ?? null,
            'content_rules' => $validated['content_rules'] ?? null,
            'brand_summary' => $validated['brand_summary'] ?? null,
            'usp' => $validated['usp'] ?? null,
            'mission' => $validated['mission'] ?? null,
            'brand_values' => $validated['brand_values'] ?? null,
            'brand_promise' => $validated['brand_promise'] ?? null,
            'differentiators' => $validated['differentiators'] ?? null,
            'proof_points' => $validated['proof_points'] ?? null,
            'price_position' => $validated['price_position'] ?? null,
            'main_cta' => $validated['main_cta'] ?? null,
            'important_links' => $validated['important_links'] ?? null,
            'positioning' => $validated['positioning'] ?? null,
            'key_messages' => $validated['key_messages'] ?? null,
            'content_mix' => $validated['content_mix'] ?? null,
            'weekly_rhythm' => $validated['weekly_rhythm'] ?? null,
            'engagement_goals' => $validated['engagement_goals'] ?? null,
            'visual_style' => $validated['visual_style'] ?? null,
            'trend_mode' => $validated['trend_mode'] ?? 'evergreen',
            'setup_step' => $validated['setup_step'] ?? 0,
            'setup_completed_at' => now(),
            'created_by' => $request->user()?->id,
        ];

        if ($summary !== null) {
            $profileAttrs['knowledge_summary_short'] = $summary;
            $profileAttrs['knowledge_summary_long'] = $summary;
            $profileAttrs['last_knowledge_sync_at'] = now();
        }

        [$profile, $readiness] = DB::transaction(function () use ($org, $brandId, $profileAttrs, $validated) {
            $profile = ContentPlannerProfile::updateOrCreate(
                ['organization_id' => $org->id, 'brand_id' => $brandId],
                $profileAttrs
            );

            // Replace related rows. Channels reference audiences (nullOnDelete),
            // so delete channels first, then audiences, then brand voices.
            $profile->channels()->delete();
            $profile->audiences()->delete();
            $profile->brandVoices()->delete();

            $base = [
                'organization_id' => $org->id,
                'brand_id' => $brandId,
                'planner_profile_id' => $profile->id,
            ];

            $audienceIds = [];
            foreach (($validated['audiences'] ?? []) as $aud) {
                if (!is_array($aud)) {
                    continue;
                }
                $audience = $profile->audiences()->create($base + [
                    'name' => $aud['name'] ?? 'Audience',
                    'job_role' => $aud['job_role'] ?? null,
                    'industry' => $aud['industry'] ?? null,
                    'country' => $aud['country'] ?? null,
                    'language' => $aud['language'] ?? null,
                    'business_size' => $aud['business_size'] ?? null,
                    'description' => $aud['description'] ?? null,
                    'pain_points' => $aud['pain_points'] ?? [],
                    'goals' => $aud['goals'] ?? [],
                    'fears' => $aud['fears'] ?? [],
                    'objections' => $aud['objections'] ?? [],
                    'buying_triggers' => $aud['buying_triggers'] ?? [],
                    'emotional_triggers' => $aud['emotional_triggers'] ?? [],
                    'rational_triggers' => $aud['rational_triggers'] ?? [],
                    'questions' => $aud['questions'] ?? [],
                    'content_they_trust' => $aud['content_they_trust'] ?? null,
                    'desired_transformation' => $aud['desired_transformation'] ?? null,
                    'preferred_platforms' => $aud['preferred_platforms'] ?? [],
                    'preferred_tone' => $aud['preferred_tone'] ?? null,
                    'is_ai_assumed' => (bool) ($aud['is_ai_assumed'] ?? false),
                    'active' => true,
                ]);
                $audienceIds[] = $audience->id;
            }

            foreach (($validated['channels'] ?? []) as $ch) {
                if (!is_array($ch)) {
                    continue;
                }
                $audIdx = $ch['audience_index'] ?? null;
                $profile->channels()->create($base + [
                    'platform' => $ch['platform'] ?? 'linkedin',
                    'label' => $ch['label'] ?? null,
                    'url' => $ch['url'] ?? null,
                    'goal' => $ch['goal'] ?? null,
                    'role' => $ch['role'] ?? null,
                    'audience_id' => ($audIdx !== null && isset($audienceIds[$audIdx])) ? $audienceIds[$audIdx] : null,
                    'default_language' => $ch['default_language'] ?? ($profileAttrs['default_language'] ?? 'en'),
                    'tone_override' => $ch['tone_override'] ?? null,
                    'posts_per_week' => $ch['posts_per_week'] ?? null,
                    'frequency' => $ch['frequency'] ?? null,
                    'preferred_formats' => $ch['preferred_formats'] ?? [],
                    'emoji_policy' => $ch['emoji_policy'] ?? null,
                    'hashtag_policy' => $ch['hashtag_policy'] ?? null,
                    'cta_style' => $ch['cta_style'] ?? null,
                    'visual_style' => $ch['visual_style'] ?? null,
                    'link_policy' => $ch['link_policy'] ?? null,
                    'active' => (bool) ($ch['active'] ?? true),
                ]);
            }

            $voice = $validated['brand_voice'] ?? null;
            if (is_array($voice)) {
                $profile->brandVoices()->create($base + [
                    'name' => 'Default',
                    'tone' => $voice['tone'] ?? null,
                    'formality_level' => $voice['formality_level'] ?? null,
                    'emoji_policy' => $voice['emoji_policy'] ?? null,
                    'hashtag_policy' => $voice['hashtag_policy'] ?? null,
                    'sentence_style' => $voice['sentence_style'] ?? null,
                    'point_of_view' => $voice['point_of_view'] ?? null,
                    'preferred_words' => $voice['preferred_words'] ?? [],
                    'forbidden_words' => $voice['forbidden_words'] ?? [],
                    'claims_to_avoid' => $voice['claims_to_avoid'] ?? [],
                    'active' => true,
                ]);
            }

            $readiness = $this->knowledgeService->readinessFor($profile);

            return [$profile, $readiness];
        });

        return response()->json([
            'profile' => $profile->fresh(['audiences', 'channels', 'brandVoices', 'pillars']),
            'readiness' => $readiness,
            'message' => 'Content Planner profile saved.',
        ], 201);
    }

    /**
     * Partial update of profile-own fields.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $profile = ContentPlannerProfile::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        // Verify ownership
        if ($profile->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate($this->profileRules());

        $profile->update($validated);

        return response()->json($profile);
    }

    /**
     * Readiness score only (404-safe).
     */
    public function readiness(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'User has no organization'], 403);
        }
        $org = Organization::find($orgId);
        $brandId = Brand::currentOrDefaultIdForOrg($org->id);
        if (!$brandId) {
            $brandId = Brand::where('organization_id', $org->id)->value('id');
        }

        $profile = $brandId
            ? ContentPlannerProfile::where('organization_id', $org->id)->where('brand_id', $brandId)->first()
            : null;

        if (!$profile) {
            return response()->json([
                'exists' => false,
                'readiness' => ['overall' => 0, 'sections' => []],
            ]);
        }

        return response()->json([
            'exists' => true,
            'readiness' => $this->knowledgeService->readinessFor($profile),
        ]);
    }

    /**
     * Regenerate knowledge summary from current FAQ/KB/settings.
     * Called when user updates their chatbot knowledge and wants the content
     * planner to pick up the changes.
     */
    public function refreshKnowledge(Request $request, int $id): JsonResponse
    {
        $profile = ContentPlannerProfile::findOrFail($id);
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');

        if ($profile->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        $summary = $this->knowledgeService->summarizeForAi($profile->organization_id, $profile->brand_id);
        $detected = $this->knowledgeService->buildForBrand($profile->organization_id, $profile->brand_id);

        $profile->update([
            'knowledge_summary_long' => $summary,
            'knowledge_summary_short' => $summary,
            'last_knowledge_sync_at' => now(),
        ]);

        return response()->json([
            'profile' => $profile,
            'detected_knowledge' => $detected,
            'message' => 'Knowledge summary refreshed',
        ]);
    }

    /**
     * Validation rules for profile-own fields (loose — everything nullable).
     */
    private function profileRules(): array
    {
        return [
            'name' => 'nullable|string|max:255',
            'default_language' => 'nullable|string|max:10',
            'default_tone' => 'nullable|string|max:100',
            'primary_goal' => 'nullable|string',
            'secondary_goals' => 'nullable|array',
            'knowledge_sources' => 'nullable|array',
            'content_rules' => 'nullable|array',
            'brand_summary' => 'nullable|string',
            'usp' => 'nullable|string',
            'mission' => 'nullable|string',
            'brand_values' => 'nullable|array',
            'brand_promise' => 'nullable|string',
            'differentiators' => 'nullable|string',
            'proof_points' => 'nullable|array',
            'price_position' => 'nullable|string|max:100',
            'main_cta' => 'nullable|string|max:255',
            'important_links' => 'nullable|array',
            'positioning' => 'nullable|array',
            'key_messages' => 'nullable|array',
            'content_mix' => 'nullable|array',
            'weekly_rhythm' => 'nullable|array',
            'engagement_goals' => 'nullable|array',
            'visual_style' => 'nullable|array',
            'trend_mode' => 'nullable|string|max:50',
            'setup_step' => 'nullable|integer',
        ];
    }
}
