<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\QrToken;
use App\Models\ScanEvent;
use App\Models\User;

/**
 * What a scanned or typed code names, for HexaTech Loyalty's Scan (spec
 * 2026-10-21 §4.7): the member app's QR code (the v2 JSON with the member
 * number, a secure token, or the legacy token), an NFC card's ID, or a member
 * number typed at the desk. Only ever a member of this organisation: the
 * secure tokens carry no organisation, so a token whose member is another
 * organisation's reads as not found and is not used up. Every scan is
 * recorded in `scan_events` with the same results the full admin's scan
 * writes; a found member is touched (`last_activity_at`) and audited.
 */
final class CardLookup
{
    /** The refusals, by the result the scan log keeps for them. */
    private const REFUSALS = [
        'member_not_found' => 'not_found',
        'invalid_token'    => 'revoked',
        'expired_token'    => 'expired',
        'replay_detected'  => 'used_up',
        'inactive_member'  => 'inactive',
    ];

    public function find(string $code, User $by): LoyaltyMember
    {
        $code = trim($code);
        [$kind, $member, $result] = $this->resolve($code);

        ScanEvent::create([
            'member_id'    => $member?->id,
            'scan_type'    => $kind,
            'token_value'  => mb_strlen($code) > 20 ? mb_substr($code, 0, 20) . '...' : $code,
            'result'       => $result,
            'action_taken' => $result === 'success' ? 'verify' : 'none',
            'staff_id'     => $by->id,
            'ip_address'   => request()?->ip(),
        ]);

        if ($result !== 'success' || !$member) {
            throw new LoyaltyRefused(self::REFUSALS[$result] ?? 'not_found', 'No member for this code.', 404);
        }

        $member->update(['last_activity_at' => now()]);
        AuditLog::record($kind === 'nfc' ? 'nfc_scanned' : 'qr_scanned', $member, [], [], $by);

        return $member;
    }

    /** @return array{0: string, 1: ?LoyaltyMember, 2: string} the scan type, the member, the result */
    private function resolve(string $code): array
    {
        if ($code === '') {
            return ['manual', null, 'member_not_found'];
        }

        // The member app's v2 QR code: JSON naming the member number.
        $json = json_decode($code, true);
        if (is_array($json) && is_string($json['member_number'] ?? null)) {
            return ['qr', ...$this->byNumber($json['member_number'])];
        }

        // A secure token, checked only once it is known to be one of ours.
        $token = QrToken::where('token', $code)->first();
        if ($token) {
            $member = LoyaltyMember::query()->whereKey($token->member_id)->first();
            if (!$member) {
                return ['qr', null, 'member_not_found'];
            }
            if ($token->is_revoked) {
                return ['qr', $member, 'invalid_token'];
            }
            if (!$token->expires_at || $token->expires_at->isPast()) {
                return ['qr', $member, 'expired_token'];
            }
            if ($token->use_count >= $token->max_uses) {
                return ['qr', $member, 'replay_detected'];
            }
            if (!$member->is_active) {
                return ['qr', $member, 'inactive_member'];
            }
            $token->consume();

            return ['qr', $member, 'success'];
        }

        $legacy = LoyaltyMember::query()->where('qr_code_token', $code)->first();
        if ($legacy) {
            return ['qr', $legacy, $legacy->is_active ? 'success' : 'inactive_member'];
        }

        // An NFC card's ID, however the reader spaced it.
        $uid = strtolower(str_replace([':', '-', ' '], '', $code));
        if ($uid !== '' && ctype_xdigit($uid)) {
            $card = NfcCard::query()
                ->whereRaw("LOWER(REPLACE(REPLACE(REPLACE(uid, ':', ''), '-', ''), ' ', '')) = ?", [$uid])
                ->first();
            if ($card) {
                $member = LoyaltyMember::query()->whereKey($card->member_id)->first();
                if (!$member) {
                    return ['nfc', null, 'member_not_found'];
                }
                if (!$card->is_active || !$member->is_active) {
                    return ['nfc', $member, 'inactive_member'];
                }
                $card->increment('scan_count');
                $card->update(['last_scanned_at' => now()]);

                return ['nfc', $member, 'success'];
            }
        }

        return ['manual', ...$this->byNumber($code)];
    }

    /** @return array{0: ?LoyaltyMember, 1: string} */
    private function byNumber(string $number): array
    {
        $member = LoyaltyMember::query()->whereRaw('UPPER(member_number) = ?', [mb_strtoupper(trim($number))])->first();
        if (!$member) {
            return [null, 'member_not_found'];
        }

        return [$member, $member->is_active ? 'success' : 'inactive_member'];
    }
}
