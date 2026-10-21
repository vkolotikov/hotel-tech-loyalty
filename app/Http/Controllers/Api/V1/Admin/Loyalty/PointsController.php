<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\MemberLedger;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Awarding, redeeming and reversing a member's points (spec 2026-10-21 §4.3).
 * The writing is LoyaltyService's, as the full admin's; the rules are
 * LoyaltyAccess's. A retry with the same `idempotency_key` writes nothing
 * new: the key is kept per organisation and member, so it can never name
 * another member's line.
 */
class PointsController extends Controller
{
    public function award(Request $request, int $id, LoyaltyService $loyalty, NotificationService $notices, RealtimeEventService $realtime): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::AWARD);
        $data = $this->validated($request);
        $member = $this->member($id);

        $line = $loyalty->awardPoints(
            member:         $member,
            points:         $data['points'],
            description:    $data['reason'],
            // As the full admin's award (its Members, member page and Scan send no type): earned points.
            type:           'earn',
            staff:          $request->user(),
            idempotencyKey: $this->key($member, $data['idempotency_key'] ?? null),
        );

        // Side effects, as the full admin's: never a reason for the award to fail.
        try {
            $notices->sendPointsEarned($member->fresh(), $data['points']);
        } catch (\Throwable $e) {
            Log::warning('loyalty workspace: sendPointsEarned failed: ' . $e->getMessage());
        }
        $this->tell($realtime, 'Points Awarded', "+{$data['points']} pts to " . ($member->user?->name ?? 'member'), $member, $data['points'], 'award');

        return response()->json($this->after($member, $line->id));
    }

    public function redeem(Request $request, int $id, LoyaltyService $loyalty, RealtimeEventService $realtime): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::REDEEM);
        $data = $this->validated($request);
        $member = $this->member($id);
        if ($data['points'] > (int) $member->current_points) {
            throw new LoyaltyRefused('not_enough_points', 'The member does not have that many points.', 422, ['balance' => (int) $member->current_points]);
        }

        try {
            $line = $loyalty->redeemPoints(
                member:         $member,
                points:         $data['points'],
                description:    $data['reason'],
                staff:          $request->user(),
                idempotencyKey: $this->key($member, $data['idempotency_key'] ?? null),
            );
        } catch (\RuntimeException $e) {
            // The service's own check, under the member's lock: the balance fell meanwhile.
            if (str_starts_with($e->getMessage(), 'Insufficient points')) {
                throw new LoyaltyRefused('not_enough_points', 'The member does not have that many points.', 422, ['balance' => (int) $member->fresh()->current_points]);
            }
            throw $e;
        }
        $this->tell($realtime, 'Points Redeemed', "-{$data['points']} pts from " . ($member->user?->name ?? 'member'), $member, $data['points'], 'redeem');

        return response()->json($this->after($member, $line->id));
    }

    public function reverse(Request $request, int $id, int $line, MemberLedger $ledger): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['reason' => 'required|string|min:2|max:200']);
        $member = $this->member($id);

        $reversal = $ledger->reverse($member, $line, trim($data['reason']), $request->user());

        return response()->json($this->after($member, $reversal->id));
    }

    /** @return array{points: int, reason: string, idempotency_key?: string} */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'points'          => 'required|integer|min:1|max:100000',
            'reason'          => 'required|string|min:2|max:200',
            'idempotency_key' => 'nullable|string|max:64',
        ]);
        $data['reason'] = trim($data['reason']);

        return $data;
    }

    /** A retry key kept per organisation and member; a new key per call when the workspace sent none. */
    private function key(LoyaltyMember $member, ?string $sent): ?string
    {
        return $sent ? "loyalty-ws:{$member->organization_id}:{$member->id}:{$sent}" : null;
    }

    /** The member's balance after the step, and the line it wrote (or found, on a retry). @return array<string, mixed> */
    private function after(LoyaltyMember $member, int $lineId): array
    {
        $member = $member->fresh(['tier']);

        return [
            'member' => ['id' => (int) $member->id, 'points' => (int) $member->current_points, 'lifetime_points' => (int) $member->lifetime_points, 'tier_id' => $member->tier_id !== null ? (int) $member->tier_id : null],
            'line'   => $lineId,
        ];
    }

    private function tell(RealtimeEventService $realtime, string $title, string $body, LoyaltyMember $member, int $points, string $action): void
    {
        try {
            $realtime->dispatch('points', $title, $body, ['id' => $member->id, 'name' => $member->user?->name, 'points' => $points, 'action' => $action]);
        } catch (\Throwable $e) {
            Log::warning('loyalty workspace: realtime dispatch failed: ' . $e->getMessage());
        }
    }

    private function member(int $id): LoyaltyMember
    {
        return LoyaltyMember::query()->with(['user', 'tier'])->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
