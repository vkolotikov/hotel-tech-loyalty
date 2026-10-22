<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Cards\NfcCards;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\Members\MemberErasure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A member's NFC cards on their page (release 5, spec 2026-10-23 §3, R5-2): the list, Link NFC card and Switch off,
 * for every staff member, as Edit details (and the full admin's NFC cards). The rules are NfcCards'; the member a
 * route names is read through the tenant scope (404 `not_found`), a card must be that member's, and a deleted
 * member's cards are gone with their details (`already_erased`).
 */
class CardsController extends Controller
{
    public function index(int $id, NfcCards $cards): JsonResponse
    {
        $member = $this->member($id);

        return response()->json(['cards' => $cards->forMember($member)->map(fn ($card) => NfcCards::row($card))->values()]);
    }

    public function store(Request $request, int $id, NfcCards $cards): JsonResponse
    {
        $member = $this->member($id);
        $this->notErased($member);
        $data = $request->validate(['uid' => 'required|string|max:100']);

        $result = $cards->link($member, $data['uid'], $request->user());

        return response()->json(['card' => NfcCards::row($result['card']), 'linked' => $result['linked']], $result['linked'] ? 201 : 200);
    }

    public function off(Request $request, int $id, int $card, NfcCards $cards): JsonResponse
    {
        $member = $this->member($id);

        return response()->json(['card' => NfcCards::row($cards->switchOff($member, $card, $request->user()))]);
    }

    /** One of this organisation's members (the tenant scope), or 404. */
    private function member(int $id): LoyaltyMember
    {
        return LoyaltyMember::query()->with('user')->find($id) ?? throw LoyaltyRefused::notFound();
    }

    private function notErased(LoyaltyMember $member): void
    {
        if (MemberErasure::isErased($member)) {
            throw new LoyaltyRefused('already_erased', 'This member was deleted.', 409);
        }
    }
}
