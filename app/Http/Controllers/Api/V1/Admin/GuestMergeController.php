<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Services\GuestMergeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Customer duplicate detection + merge.
 *
 * Mirrors MemberMergeController for the CRM-side Guest model. See
 * GuestMergeService for the per-table re-point logic.
 */
class GuestMergeController extends Controller
{
    public function __construct(protected GuestMergeService $merger) {}

    /**
     * GET /v1/admin/guests/duplicates — suggested duplicate pairs in this org.
     */
    public function suggestions(Request $request): JsonResponse
    {
        $limit = (int) $request->get('limit', 50);
        $limit = max(1, min(200, $limit));

        return response()->json([
            'pairs' => $this->merger->findDuplicates($limit, $request->user()?->organization_id),
        ]);
    }

    /**
     * POST /v1/admin/guests/merge — merge loser_id INTO winner_id.
     * The winner survives; the loser is deleted after all related rows
     * have been re-pointed.
     */
    public function merge(Request $request): JsonResponse
    {
        $data = $request->validate([
            'winner_id' => 'required|integer|exists:guests,id',
            'loser_id'  => 'required|integer|exists:guests,id|different:winner_id',
            'reason'    => 'nullable|string|max:500',
        ]);

        // Explicit lookups so cross-tenant cases give a clean message instead
        // of a silent TenantScope 404. Same defensive pattern as
        // GuestController::show / update.
        $winner = Guest::find($data['winner_id']);
        $loser  = Guest::find($data['loser_id']);
        if (!$winner || !$loser) {
            return response()->json([
                'message' => 'One or both guests not found in your organization.',
            ], 404);
        }

        try {
            $result = $this->merger->merge(
                $winner,
                $loser,
                $request->user()?->id,
                $data['reason'] ?? null,
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            \Log::error('Guest merge failed', [
                'winner_id' => $data['winner_id'],
                'loser_id'  => $data['loser_id'],
                'error'     => $e->getMessage(),
            ]);
            return response()->json([
                'message' => 'Merge failed: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'message' => 'Customers merged successfully.',
            'result'  => $result,
        ]);
    }
}
