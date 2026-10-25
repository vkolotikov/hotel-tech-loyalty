<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\Loyalty\Visits\DeskVisit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A member at the desk and their stamp card (release 7, spec 2026-10-25 §2). The rules are DeskVisit's and
 * StampCards'; this names the member (this organisation's, through the tenant scope, or 404) and the caller's right.
 */
class VisitController extends Controller
{
    /**
     * `POST members/{id}/check-in` `{ amount?: number, note?: string, idempotency_key?: string }` (the `Idempotency-Key`
     * header when the body has none): a check-in, or a purchase entered at the desk. Awarding points:
     * `can_award_points`, as Award. The answer is DeskVisit::record()'s.
     */
    public function checkIn(Request $request, int $id, DeskVisit $desk): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::AWARD);
        $data = $request->validate([
            'amount'          => 'nullable|numeric|gt:0|max:' . DeskVisit::MAX_AMOUNT,
            'note'            => 'nullable|string|max:200',
            'idempotency_key' => 'nullable|string|max:64',
        ]);
        $member = $this->member($id);

        return response()->json($desk->record(
            $member,
            isset($data['amount']) ? round((float) $data['amount'], 6) : null,
            $data['note'] ?? null,
            $this->key($request, $data['idempotency_key'] ?? null),
            $request->user(),
        ));
    }

    /** `GET members/{id}/stamps`: the member's stamp card and its history, with staff details (StampCards::forMember). */
    public function stamps(int $id, StampCards $stamps): JsonResponse
    {
        return response()->json($stamps->forMember($this->member($id), forStaff: true));
    }

    /** The body's key, or the header's when the body has none (a long header kept as its hash, within the column). */
    private function key(Request $request, ?string $sent): ?string
    {
        $key = $sent ?: trim((string) $request->header('Idempotency-Key', ''));

        return $key === '' ? null : (mb_strlen($key) > 64 ? sha1($key) : $key);
    }

    private function member(int $id): LoyaltyMember
    {
        return LoyaltyMember::query()->with(['user', 'tier'])->find($id) ?? throw LoyaltyRefused::notFound();
    }
}
