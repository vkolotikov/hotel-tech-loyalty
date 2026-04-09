<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\MemberMergeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MemberMergeController extends Controller
{
    public function __construct(protected MemberMergeService $merger) {}

    /**
     * Returns suggested duplicate pairs in the current organization.
     * Driven by shared email or shared phone — strongest matches first.
     */
    public function suggestions(Request $request): JsonResponse
    {
        $limit = (int) $request->get('limit', 50);
        return response()->json([
            'pairs' => $this->merger->findDuplicates($limit),
        ]);
    }

    /**
     * Merge two members. The "winner_id" survives, the "loser_id" is removed
     * and all of its rows are reassigned to the winner.
     */
    public function merge(Request $request): JsonResponse
    {
        $data = $request->validate([
            'winner_id' => 'required|integer|exists:loyalty_members,id',
            'loser_id'  => 'required|integer|exists:loyalty_members,id|different:winner_id',
            'reason'    => 'nullable|string|max:500',
        ]);

        $winner = LoyaltyMember::findOrFail($data['winner_id']);
        $loser  = LoyaltyMember::findOrFail($data['loser_id']);

        try {
            $result = $this->merger->merge(
                $winner,
                $loser,
                $request->user()?->id,
                $data['reason'] ?? null
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            \Log::error('Member merge failed', [
                'winner_id' => $data['winner_id'],
                'loser_id'  => $data['loser_id'],
                'error'     => $e->getMessage(),
            ]);
            return response()->json(['message' => 'Merge failed: ' . $e->getMessage()], 500);
        }

        return response()->json([
            'message' => 'Members merged successfully.',
            'result'  => $result,
        ]);
    }
}
