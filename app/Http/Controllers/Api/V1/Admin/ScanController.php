<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\QrToken;
use App\Models\ScanEvent;
use App\Models\TierBenefit;
use App\Models\BenefitEntitlement;
use App\Services\OpenAiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScanController extends Controller
{
    public function __construct(protected OpenAiService $openAi) {}

    public function scanQr(Request $request): JsonResponse
    {
        $validated = $request->validate(['token' => 'required|string']);

        // Try secure QR token first, fall back to legacy qr_code_token
        $qrToken = QrToken::where('token', $validated['token'])->first();
        $scanResult = 'success';
        $member = null;

        if ($qrToken) {
            if (!$qrToken->isValid()) {
                $scanResult = match (true) {
                    $qrToken->is_revoked                             => 'invalid_token',
                    $qrToken->expires_at->isPast()                   => 'expired_token',
                    $qrToken->use_count >= $qrToken->max_uses        => 'replay_detected',
                    default => 'error',
                };

                $reason = match ($scanResult) {
                    'expired_token'   => 'QR code has expired',
                    'invalid_token'   => 'QR code has been revoked',
                    'replay_detected' => 'QR code has exceeded maximum uses',
                    default           => 'Invalid QR code',
                };

                ScanEvent::create([
                    'scan_type'   => 'qr',
                    'token_value' => substr($validated['token'], 0, 20) . '...',
                    'result'      => $scanResult,
                    'staff_id'    => $request->user()->id,
                    'property_id' => $request->user()->property_id ?? null,
                    'device_id'   => $request->header('X-Device-Id'),
                    'ip_address'  => $request->ip(),
                ]);

                return response()->json(['message' => $reason], 404);
            }

            $qrToken->consume();
            $member = $qrToken->member()
                ->where('is_active', true)
                ->with(['user', 'tier', 'bookings' => fn($q) => $q->latest()->limit(3)])
                ->first();
        } else {
            // Legacy fallback
            $member = LoyaltyMember::where('qr_code_token', $validated['token'])
                ->where('is_active', true)
                ->with(['user', 'tier', 'bookings' => fn($q) => $q->latest()->limit(3)])
                ->first();
        }

        if (!$member) {
            ScanEvent::create([
                'scan_type'   => 'qr',
                'token_value' => substr($validated['token'], 0, 20) . '...',
                'result'      => 'inactive_member',
                'staff_id'    => $request->user()->id,
                'device_id'   => $request->header('X-Device-Id'),
                'ip_address'  => $request->ip(),
            ]);
            return response()->json(['message' => 'Invalid or expired QR code'], 404);
        }

        $member->update(['last_activity_at' => now()]);

        ScanEvent::create([
            'member_id'   => $member->id,
            'scan_type'   => 'qr',
            'token_value' => substr($validated['token'], 0, 20) . '...',
            'result'      => 'success',
            'action_taken'=> 'verify',
            'staff_id'    => $request->user()->id,
            'property_id' => $request->user()->property_id ?? null,
            'device_id'   => $request->header('X-Device-Id'),
            'ip_address'  => $request->ip(),
        ]);

        AuditLog::record('qr_scanned', $member, [], [], $request->user());

        return $this->buildScanResponse($member, $request->user());
    }

    public function scanNfc(Request $request): JsonResponse
    {
        $validated = $request->validate(['uid' => 'required|string']);
        $uid = strtolower(str_replace([':', '-', ' '], '', $validated['uid']));

        // Look for active card first
        $nfcCard = NfcCard::whereRaw("LOWER(REPLACE(REPLACE(REPLACE(uid, ':', ''), '-', ''), ' ', '')) = ?", [$uid])
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

    public function linkNfcCard(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'member_id' => 'required|exists:loyalty_members,id',
            'uid'       => 'required|string|max:100',
            'card_type' => 'nullable|string|max:50',
        ]);

        // Check if this UID is already assigned
        $existing = NfcCard::where('uid', $validated['uid'])->where('is_active', true)->first();
        if ($existing) {
            return response()->json(['message' => 'This NFC card is already linked to a member'], 422);
        }

        $card = NfcCard::create([
            'member_id' => $validated['member_id'],
            'uid'       => $validated['uid'],
            'card_type' => $validated['card_type'] ?? 'standard',
            'issued_at' => now(),
            'issued_by' => $request->user()->id,
            'is_active' => true,
        ]);

        // Also set the member's qr_code_token to the NFC UID for unified identification
        LoyaltyMember::where('id', $validated['member_id'])
            ->update(['qr_code_token' => $validated['uid']]);

        AuditLog::record('nfc_card_linked', $card, [
            'member_id' => $validated['member_id'],
            'uid'       => $validated['uid'],
        ], [], $request->user());

        return response()->json(['message' => 'NFC card linked', 'card' => $card], 201);
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
}
