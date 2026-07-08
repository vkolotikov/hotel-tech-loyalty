<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\ContentPlannerProfile;
use App\Services\ContentCalendarGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * AI calendar generation — fills a date range with strategically planned draft posts.
 *
 * Endpoint:
 *   POST /v1/admin/content-planner/calendar/generate
 */
class ContentPlannerCalendarController extends Controller
{
    public function __construct(
        protected ContentCalendarGenerationService $calendarService
    ) {}

    /**
     * Generate calendar posts for a date range (max 62 days).
     *
     * Body: { start_date, end_date, platforms?, fill_empty_only?, instructions?, planner_profile_id? }
     */
    public function generate(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id ?? app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'User has no organization'], 403);
        }

        $validated = $request->validate([
            'start_date' => 'required|date',
            'end_date' => 'required|date',
            'platforms' => 'nullable|array',
            'fill_empty_only' => 'nullable|boolean',
            'instructions' => 'nullable|string',
            'planner_profile_id' => 'nullable|integer',
        ]);

        if (!empty($validated['planner_profile_id'])) {
            $profile = ContentPlannerProfile::find($validated['planner_profile_id']);
        } else {
            // Resolve the same brand's profile that GET profile shows — in
            // "All brands" mode an unordered first() could pick another
            // brand's profile and generate posts against the wrong context.
            $brandId = Brand::currentOrDefaultIdForOrg($orgId)
                ?: Brand::where('organization_id', $orgId)->value('id');
            $profile = ContentPlannerProfile::where('organization_id', $orgId)
                ->when($brandId, fn ($q) => $q->where('brand_id', $brandId))
                ->first();
        }

        if (!$profile) {
            return response()->json(['error' => 'Content Planner profile not found. Complete the setup wizard first.'], 404);
        }
        if ($profile->organization_id !== $orgId) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        set_time_limit(600);

        try {
            $result = $this->calendarService->generate(
                $profile,
                $validated['start_date'],
                $validated['end_date'],
                [
                    'platforms' => $validated['platforms'] ?? null,
                    'fill_empty_only' => $request->boolean('fill_empty_only', true),
                    'instructions' => $validated['instructions'] ?? null,
                ]
            );

            $createdCount = count($result['created']);

            return response()->json([
                'created_count' => $createdCount,
                'posts' => $result['created'],
                'skipped_dates' => $result['skipped_dates'],
                'message' => $createdCount > 0
                    ? "Generated {$createdCount} calendar posts across {$result['weeks_processed']} week(s)."
                    : 'No new posts were generated — the selected slots may already be filled.',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Calendar generation failed',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
