<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\NfcCard;
use App\Models\QrToken;
use App\Models\ScanEvent;
use App\Models\User;
use App\Services\Loyalty\Cards\CardRead;
use App\Services\Loyalty\Cards\CodeReader;
use Illuminate\Support\Facades\DB;

/**
 * What a scanned or typed code names, for HexaTech Loyalty's Scan (spec 2026-10-21 §4.7) and, since release 5
 * (spec 2026-10-23 §3), the full admin's QR scan too. Only ever a member of this organisation: members and cards are
 * read through the tenant scope, and the secure tokens carry no organisation, so a token whose member is another
 * organisation's reads as not found and is not used up.
 *
 * The code is read tolerantly, in this order (CodeReader does the reading, this class the looking up):
 *  1. the spaces around it and a leading `#` (the wallet pass shows `#LS-001001`) dropped;
 *  2. the member app's JSON naming a member number (v2), as it is or as a keyboard layout bent it;
 *  3. the older app's JSON naming a token (v1);
 *  4. a link carrying a member number or a token;
 *  5. a secure QR token, then the legacy `qr_code_token`;
 *  6. an NFC card's ID in hex, however the reader spaced it;
 *  7. a member number in any case, with or without its hyphen; then, since release 6, one a keyboard layout bent
 *     (German, Russian, French, Spanish), typed back (CodeReader::numberForms);
 *  8. the digits alone, when exactly one member's number ends with them (two or more: not found, never a guess);
 *  9. an NFC card's ID in decimal (a 4- or 7-byte ID, either byte order), then a hex ID in the other byte order.
 *
 * find() records every scan in `scan_events` with the same results the full admin's scan writes; a found member is
 * touched (`last_activity_at`) and audited. read() only reads (a secure token is used up and a card's scan counted,
 * as a scan does), for a caller that logs and answers in its own words.
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
        $read = $this->read($code, $by);
        $member = $read->member;
        $result = $read->result;

        ScanEvent::create([
            'member_id'    => $member?->id,
            'scan_type'    => $read->kind,
            'token_value'  => mb_strlen($code) > 20 ? mb_substr($code, 0, 20) . '...' : $code,
            'result'       => $result,
            'action_taken' => $result === 'success' ? 'verify' : 'none',
            'staff_id'     => $by->id,
            'ip_address'   => request()?->ip(),
        ]);

        if (!$read->found()) {
            // A switched-off card of ours says so beside the code, so the desk can link it again.
            throw new LoyaltyRefused(self::REFUSALS[$result] ?? 'not_found', 'No member for this code.', 404, $read->cardOff ? ['card' => 'off'] : []);
        }

        $member->update(['last_activity_at' => now()]);
        AuditLog::record($read->kind === 'nfc' ? 'nfc_scanned' : 'qr_scanned', $member, [], [], $by);

        return $member;
    }

    /** What the code names, read tolerantly; nothing is logged. `$by` is noted on a card's last scan. */
    public function read(string $code, ?User $by = null): CardRead
    {
        $code = CodeReader::clean($code);
        if ($code === '') {
            return new CardRead('manual', CardRead::NONE, null, 'member_not_found');
        }

        // The member app's QR code (v2 member number, v1 token), however a keyboard layout bent it.
        $app = CodeReader::appCode($code);
        if ($app !== null) {
            [$form, $value] = $app;
            if ($form === 'number') {
                [$member, $result] = $this->byNumber($value);

                return new CardRead('qr', CardRead::APP_NUMBER, $member, $result, $value);
            }

            return $this->byToken($value, CardRead::APP_TOKEN) ?? new CardRead('qr', CardRead::APP_TOKEN, null, 'member_not_found', $value);
        }

        // A link: the first value it carries that names someone (a token, or a member number).
        $values = CodeReader::urlValues($code);
        if ($values !== null) {
            foreach ($values as $value) {
                $read = $this->byToken($value, CardRead::URL);
                if ($read !== null) {
                    return $read;
                }
                [$member, $result] = $this->byNumber($value);
                if ($member !== null) {
                    return new CardRead('qr', CardRead::URL, $member, $result, $value);
                }
            }

            return new CardRead('qr', CardRead::URL, null, 'member_not_found');
        }

        $read = $this->byToken($code, CardRead::TOKEN);
        if ($read !== null) {
            return $read;
        }

        $hex = CodeReader::hexUid($code);
        if ($hex !== null && ($read = $this->byCard([$hex], $by)) !== null) {
            return $read;
        }

        [$member, $result] = $this->byNumber($code);
        if ($member !== null) {
            return new CardRead('manual', CardRead::NUMBER, $member, $result, $code);
        }
        // A member number a scanner's keyboard layout bent (release 6: `LS)àà&àà&` on AZERTY), typed back.
        foreach (CodeReader::numberForms($code) as $typed) {
            [$member, $result] = $this->byNumber($typed);
            if ($member !== null) {
                return new CardRead('manual', CardRead::NUMBER, $member, $result, $typed);
            }
        }

        $digits = CodeReader::digits($code);
        if ($digits !== null && ($member = $this->byDigits($digits)) !== null) {
            return new CardRead('manual', CardRead::DIGITS, $member, $member->is_active ? 'success' : 'inactive_member', $digits);
        }

        $decimal = CodeReader::decimalUids($code);
        if ($decimal !== [] && ($read = $this->byCard($decimal, $by)) !== null) {
            return $read;
        }
        $reversed = $hex === null ? null : CodeReader::reversed($hex);
        if ($reversed !== null && ($read = $this->byCard([$reversed], $by)) !== null) {
            return $read;
        }

        return new CardRead('manual', CardRead::NONE, null, 'member_not_found');
    }

    /** A secure token, checked only once it is known to be one of ours, then the legacy token; null when neither. */
    private function byToken(string $value, string $form): ?CardRead
    {
        $token = QrToken::where('token', $value)->first();
        if ($token) {
            $member = LoyaltyMember::query()->whereKey($token->member_id)->first();
            $result = match (true) {
                !$member                                          => 'member_not_found',
                (bool) $token->is_revoked                         => 'invalid_token',
                !$token->expires_at || $token->expires_at->isPast() => 'expired_token',
                $token->use_count >= $token->max_uses             => 'replay_detected',
                !$member->is_active                               => 'inactive_member',
                default                                           => 'success',
            };
            if ($result === 'success') {
                $token->consume();
            }

            return new CardRead('qr', $form, $member, $result, $value);
        }

        $legacy = LoyaltyMember::query()->where('qr_code_token', $value)->first();
        if ($legacy) {
            return new CardRead('qr', $form, $legacy, $legacy->is_active ? 'success' : 'inactive_member', $value);
        }

        return null;
    }

    /**
     * The first of these card IDs this organisation has a card for (in the order given); its scan is counted when it
     * finds an active member. Null when none.
     *
     * @param list<string> $uids
     */
    private function byCard(array $uids, ?User $by): ?CardRead
    {
        $cards = NfcCard::query()->whereIn(DB::raw(CodeReader::UID_SQL), $uids)->get();
        $card = collect($uids)->map(fn (string $uid) => $cards->first(fn (NfcCard $c) => CodeReader::hexUid((string) $c->uid) === $uid))->filter()->first();
        if (!$card) {
            return null;
        }

        $member = LoyaltyMember::query()->whereKey($card->member_id)->first();
        if (!$member) {
            return new CardRead('nfc', CardRead::CARD, null, 'member_not_found');
        }
        if (!$card->is_active || !$member->is_active) {
            return new CardRead('nfc', CardRead::CARD, $member, 'inactive_member', null, !$card->is_active);
        }
        $card->increment('scan_count');
        $card->update(['last_scanned_at' => now()] + ($by ? ['last_scanned_by' => $by->id] : []));

        return new CardRead('nfc', CardRead::CARD, $member, 'success');
    }

    /**
     * A member number compared normalised (CodeReader::number); when two numbers read alike, only the one written
     * exactly so counts, else nobody.
     *
     * @return array{0: ?LoyaltyMember, 1: string}
     */
    private function byNumber(string $number): array
    {
        $wanted = CodeReader::number($number);
        if ($wanted === '') {
            return [null, 'member_not_found'];
        }
        // Written exactly as stored: the unique index answers, and it is the one typed exactly however others read.
        $members = LoyaltyMember::query()->where('member_number', CodeReader::clean($number))->limit(1)->get();
        if ($members->isEmpty()) {
            $members = LoyaltyMember::query()->whereRaw(CodeReader::NUMBER_SQL . ' = ?', [$wanted])->limit(5)->get();
        }
        if ($members->count() > 1) {
            $exact = mb_strtoupper(CodeReader::clean($number));
            $members = $members->filter(fn (LoyaltyMember $m) => mb_strtoupper((string) $m->member_number) === $exact)->values();
        }
        $member = $members->count() === 1 ? $members->first() : null;
        if (!$member) {
            return [null, 'member_not_found'];
        }

        return [$member, $member->is_active ? 'success' : 'inactive_member'];
    }

    /** The one member whose number ends with these digits, or null (none, or two or more: never a guess). */
    private function byDigits(string $digits): ?LoyaltyMember
    {
        $members = LoyaltyMember::query()->whereRaw(CodeReader::NUMBER_SQL . ' LIKE ?', ['%' . $digits])->limit(2)->get();

        return $members->count() === 1 ? $members->first() : null;
    }
}
