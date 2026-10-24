<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\Cards\NfcCards;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NfcController extends Controller
{
    /**
     * Issue a card to a member: it becomes their one active card. Since release 6 (spec 2026-10-23 §2 item 2) the
     * card is linked through NfcCards, in this endpoint's own answers: the ID stored normalised and compared in every
     * form against every organisation's cards. An ID any card already holds (active here, or another organisation's)
     * is the field error it always was ("has already been taken"), naming nobody; a card switched off here is issued
     * again on its own row; an entry that is no card ID is a field error on `uid`; the member must be this
     * organisation's. The member's other active cards are switched off only once the card is theirs, in the same
     * transaction; `nfc_uid` notes the stored ID; the audit is `nfc_issued`, as before.
     */
    public function issue(Request $request, NfcCards $cards): JsonResponse
    {
        $validated = $request->validate([
            'member_id' => ['required', 'bail', 'integer', OwnRows::rule('loyalty_members')],
            'uid'       => 'required|string|max:50',
            'card_type' => 'nullable|string|max:50',
        ]);

        $member = LoyaltyMember::findOrFail($validated['member_id']);
        $user = $request->user();

        $card = DB::transaction(function () use ($cards, $member, $validated, $user) {
            try {
                $result = $cards->link($member, $validated['uid'], $user, $validated['card_type'] ?? 'NTAG215', 'admin', audited: false);
            } catch (LoyaltyRefused $refused) {
                throw ValidationException::withMessages(['uid' => $refused->errorCode === 'bad_uid' ? 'The uid is not an NFC card ID.' : 'The uid has already been taken.']);
            }
            if (!$result['linked']) {
                throw ValidationException::withMessages(['uid' => 'The uid has already been taken.']);
            }
            $card = $result['card'];

            // The member's other active cards are switched off: an issued card is their one card.
            NfcCard::where('member_id', $member->id)->where('is_active', true)->whereKeyNot($card->id)->update(['is_active' => false]);
            $member->update(['nfc_uid' => $card->uid, 'nfc_card_issued_at' => now()]);
            AuditLog::record('nfc_issued', $member, ['uid' => $card->uid], [], $user);

            return $card;
        });

        return response()->json(['message' => 'NFC card issued', 'card' => $card], 201);
    }

    public function deactivate(Request $request, int $cardId): JsonResponse
    {
        $card = NfcCard::findOrFail($cardId);
        $card->update(['is_active' => false]);
        AuditLog::record('nfc_deactivated', $card->member, ['uid' => $card->uid], [], $request->user());

        return response()->json(['message' => 'NFC card deactivated']);
    }
}
