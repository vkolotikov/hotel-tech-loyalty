<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\StampCard;
use App\Services\Loyalty\Stamps\StampCards;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The member's own stamp card (release 7, spec 2026-10-25 §2), read only: `GET /v1/member/stamps` (the member app's
 * next build) and `GET /v1/member/portal/stamps` (the portal). StampCards::forMember() without the staff details; just
 * `{ enabled: false }` while the venue's stamp card is off (or its programme is) and the member has no card.
 */
class StampController extends Controller
{
    public function show(Request $request, StampCards $stamps): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->firstOrFail();
        $orgId = (int) $member->organization_id;

        $card = $stamps->forMember($member);
        $hasCard = StampCard::withoutGlobalScopes()->where('organization_id', $orgId)->where('member_id', $member->id)->exists();
        if (!PortalBootstrap::loyaltyOn($orgId)) {
            $card['enabled'] = false;
        }
        if (!$card['enabled'] && !$hasCard) {
            return response()->json(['enabled' => false]);
        }

        return response()->json($card);
    }
}
