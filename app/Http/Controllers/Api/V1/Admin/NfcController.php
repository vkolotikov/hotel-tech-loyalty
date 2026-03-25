<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NfcController extends Controller
{
    public function issue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'member_id' => 'required|exists:loyalty_members,id',
            'uid'       => 'required|string|max:50|unique:nfc_cards,uid',
            'card_type' => 'nullable|string|max:50',
        ]);

        $member = LoyaltyMember::findOrFail($validated['member_id']);

        // Deactivate any existing active NFC cards for this member
        NfcCard::where('member_id', $member->id)->where('is_active', true)->update(['is_active' => false]);

        $card = NfcCard::create([
            'member_id' => $member->id,
            'uid'       => $validated['uid'],
            'card_type' => $validated['card_type'] ?? 'NTAG215',
            'issued_at' => now(),
            'issued_by' => $request->user()->id,
            'is_active' => true,
        ]);

        $member->update(['nfc_uid' => $validated['uid'], 'nfc_card_issued_at' => now()]);

        AuditLog::record('nfc_issued', $member, ['uid' => $validated['uid']], [], $request->user());

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
