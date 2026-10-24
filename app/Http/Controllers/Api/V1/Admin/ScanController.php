<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\ScanEvent;
use App\Models\TierBenefit;
use App\Models\BenefitEntitlement;
use App\Services\Booking\Setup\OwnRows;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\Cards\CardRead;
use App\Services\Loyalty\Cards\CodeReader;
use App\Services\Loyalty\Cards\NfcCards;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ScanController extends Controller
{
    public function __construct(protected OpenAiService $openAi) {}

    /**
     * The camera's (or a reader's) code to the member it names. Since HexaTech Loyalty release 5 (R5-3) the code is
     * read by CardLookup's tolerant reading, shared with the workspace's Scan: the member app's QR code however a
     * keyboard layout bent it, the older app's token, the wallet pass, a link, a member number, a card's ID. The
     * answer, its messages and the scan log are as before: the app's code names a number ("Member not found"), a
     * token says why it cannot be used, anything else is "Invalid or expired QR code".
     */
    public function scanQr(Request $request, CardLookup $cards): JsonResponse
    {
        $validated = $request->validate(['token' => 'required|string']);
        $read = $cards->read($validated['token'], $request->user());
        $byNumber = $read->form === CardRead::APP_NUMBER;
        $logged = $byNumber ? (string) $read->value : substr($read->value ?? $validated['token'], 0, 20) . '...';
        $log = [
            'scan_type'   => 'qr',
            'token_value' => $logged,
            'staff_id'    => $request->user()->id,
            'device_id'   => $request->header('X-Device-Id'),
            'ip_address'  => $request->ip(),
        ];

        if (!$read->found()) {
            if ($byNumber) {
                ScanEvent::create($log + ['result' => 'member_not_found']);

                return response()->json(['message' => 'Member not found'], 404);
            }

            $reason = match ($read->result) {
                'expired_token'   => 'QR code has expired',
                'invalid_token'   => 'QR code has been revoked',
                'replay_detected' => 'QR code has exceeded maximum uses',
                default           => null,
            };
            if ($reason !== null) {
                ScanEvent::create($log + ['result' => $read->result, 'property_id' => $request->user()->property_id ?? null]);

                return response()->json(['message' => $reason], 404);
            }

            ScanEvent::create($log + ['result' => 'inactive_member']);

            return response()->json(['message' => 'Invalid or expired QR code'], 404);
        }

        $member = $read->member->load(['user', 'tier', 'bookings' => fn($q) => $q->latest()->limit(3)]);
        $member->update(['last_activity_at' => now()]);

        ScanEvent::create($log + [
            'member_id'    => $member->id,
            'result'       => 'success',
            'action_taken' => 'verify',
            'property_id'  => $request->user()->property_id ?? null,
        ]);

        AuditLog::record('qr_scanned', $member, [], [], $request->user());

        return $this->buildScanResponse($member, $request->user());
    }

    /**
     * A tapped card to its member. Since release 6 the card is compared as NfcCards stores it (CodeReader::UID_SQL):
     * the ID however the reader spaced it, and the forms the same card may be stored under (a decimal entry as hex,
     * the other byte order), an active row before a switched-off one. The answers and their messages are as before.
     */
    public function scanNfc(Request $request): JsonResponse
    {
        $validated = $request->validate(['uid' => 'required|string']);
        $uid = strtolower(str_replace([':', '-', ' '], '', $validated['uid']));
        $card = CodeReader::cardUid($validated['uid']);
        $forms = array_values(array_unique([$uid, ...($card ? [$card['uid'], ...$card['also']] : [])]));
        $stored = fn (NfcCard $c) => strtolower(str_replace([':', '-', ' ', '.', '_'], '', (string) $c->uid));

        $nfcCard = NfcCard::query()->whereIn(DB::raw(CodeReader::UID_SQL), $forms)->get()
            ->sortBy(fn (NfcCard $c) => [$c->is_active ? 0 : 1, array_search($stored($c), $forms, true), $c->id])
            ->first();

        if (!$nfcCard) {
            // Also check qr_code_token (unified ID)
            $member = LoyaltyMember::whereRaw("LOWER(REPLACE(REPLACE(REPLACE(qr_code_token, ':', ''), '-', ''), ' ', '')) = ?", [$uid])
                ->where('is_active', true)
                ->with(['user', 'tier', 'bookings' => fn($q) => $q->latest()->limit(3)])
                ->first();

            if ($member) {
                $member->update(['last_activity_at' => now()]);
                AuditLog::record('nfc_scanned', $member, [], [], $request->user());
                return $this->buildScanResponse($member, $request->user());
            }

            return response()->json([
                'message' => 'Card not registered — register this member',
                'status'  => 'card_not_found',
                'uid'     => $validated['uid'],
            ], 404);
        }

        if (!$nfcCard->is_active) {
            return response()->json([
                'message' => 'This card has been deactivated',
                'status'  => 'card_inactive',
                'uid'     => $validated['uid'],
            ], 404);
        }

        $nfcCard->increment('scan_count');
        $nfcCard->update(['last_scanned_at' => now(), 'last_scanned_by' => $request->user()->id]);

        $member = $nfcCard->member()->with(['user', 'tier', 'bookings' => fn($q) => $q->latest()->limit(3)])->first();
        $member->update(['last_activity_at' => now()]);

        AuditLog::record('nfc_scanned', $member, [], [], $request->user());

        return $this->buildScanResponse($member, $request->user());
    }

    /**
     * Link a card to a member. Since release 6 (spec 2026-10-23 §2 item 2) through NfcCards, in this endpoint's own
     * answers: the ID stored normalised (lower-case hex, no separators, a decimal entry converted) and compared in
     * every form against every organisation's cards. Active for any member here (this one included) is the 422 it
     * always was; another organisation's card is a 422 that names nobody; a card switched off here is linked again on
     * its own row; an entry that is no card ID is a field error on `uid`. The member must be this organisation's (a
     * field error on `member_id`, as an unknown id always was). The member's QR code (`qr_code_token`) is no longer
     * set to the card's ID: nothing needs the ID there (scan/nfc and both Scans find the card by its row), the copy
     * replaced the member's wallet-pass barcode, and as a unique 64-character column it refused a card linked again.
     */
    public function linkNfcCard(Request $request, NfcCards $cards): JsonResponse
    {
        $validated = $request->validate([
            'member_id' => ['required', 'bail', 'integer', OwnRows::rule('loyalty_members')],
            'uid'       => 'required|string|max:100',
            'card_type' => 'nullable|string|max:50',
        ]);
        $member = LoyaltyMember::query()->findOrFail((int) $validated['member_id']);

        try {
            $result = $cards->link($member, $validated['uid'], $request->user(), $validated['card_type'] ?? 'standard', 'admin');
        } catch (LoyaltyRefused $refused) {
            return match ($refused->errorCode) {
                'bad_uid'        => throw ValidationException::withMessages(['uid' => 'The uid is not an NFC card ID.']),
                'card_elsewhere' => response()->json(['message' => 'This NFC card cannot be linked here'], 422),
                default          => response()->json(['message' => 'This NFC card is already linked to a member'], 422),
            };
        }
        if (!$result['linked']) {
            return response()->json(['message' => 'This NFC card is already linked to a member'], 422);
        }

        return response()->json(['message' => 'NFC card linked', 'card' => $result['card']], 201);
    }

    private function buildScanResponse(LoyaltyMember $member, $staff): JsonResponse
    {
        $upsell = '';
        try {
            $upsell = $this->openAi->suggestUpsell($member);
        } catch (\Throwable) {}

        // Load active tier benefits with their benefit definitions
        $tierBenefits = TierBenefit::where('tier_id', $member->tier_id)
            ->where('is_active', true)
            ->with(['benefit' => fn($q) => $q->select('id', 'name', 'code', 'category', 'description', 'fulfillment_mode')
                ->where('is_active', true)])
            ->get()
            ->filter(fn($tb) => $tb->benefit !== null)
            ->map(fn($tb) => [
                'id'                 => $tb->id,
                'name'               => $tb->benefit->name,
                'code'               => $tb->benefit->code,
                'category'           => $tb->benefit->category,
                'description'        => $tb->custom_description ?? $tb->benefit->description,
                'value'              => $tb->value,
                'fulfillment_mode'   => $tb->benefit->fulfillment_mode,
            ])
            ->values();

        // Load member's pending/eligible/approved entitlements
        $entitlements = BenefitEntitlement::where('member_id', $member->id)
            ->whereIn('status', ['pending', 'eligible', 'approved'])
            ->with('benefit:id,name,code,category')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'member'         => [
                'id'             => $member->id,
                'member_number'  => $member->member_number,
                'name'           => $member->user->name,
                'email'          => $member->user->email,
                'phone'          => $member->user->phone,
                'tier'           => $member->tier,
                'current_points' => $member->current_points,
                'lifetime_points'=> $member->lifetime_points,
                'joined_at'      => $member->joined_at,
                'last_stay'      => $member->bookings->first(),
                'progress'       => $member->getProgressToNextTier(),
            ],
            'tier_benefits'        => $tierBenefits,
            'entitlements'         => $entitlements,
            'ai_upsell_suggestion' => $upsell,
        ]);
    }

    public function updateStaffPushToken(Request $request): JsonResponse
    {
        $validated = $request->validate(['expo_push_token' => 'required|string']);
        $staff = \App\Models\Staff::where('user_id', $request->user()->id)->first();
        if ($staff) {
            $staff->update(['expo_push_token' => $validated['expo_push_token']]);
        }
        return response()->json(['message' => 'Push token updated']);
    }
}
