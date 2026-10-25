<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\Credit\CreditLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The member's own cashback credit (release 7, spec 2026-10-25 §3), read only: `GET member/credit` (for the app's next
 * build) and `GET member/portal/credit` (portal Home). Whether cashback is on, the balance in the venue's currency and
 * the last lines — never who on the staff wrote them. Credit is spent at the desk only (R7-2): there is nothing to
 * write here.
 */
class CreditController extends Controller
{
    public function show(Request $request, CreditLedger $ledger): JsonResponse
    {
        $member = $request->user()?->loyaltyMember;
        if ($member === null) {
            return response()->json(['error' => 'not_found', 'message' => 'No membership was found for this account.'], 404);
        }

        return response()->json($ledger->forMemberSelf($member));
    }
}
