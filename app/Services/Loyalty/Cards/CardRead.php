<?php

namespace App\Services\Loyalty\Cards;

use App\Models\LoyaltyMember;

/**
 * What CardLookup read a code as, before anything is logged or answered (release 5, spec 2026-10-23 §3): the scan
 * log's type and result words, the member when one was named, the form the code had, and the value read from it.
 * The full admin's scanQr answers from this in its own words; the workspace's Scan through CardLookup::find().
 */
final class CardRead
{
    /** The member app's JSON naming a member number (as it is, or bent by a keyboard layout). */
    public const APP_NUMBER = 'app_number';
    /** The older app's JSON naming a token. */
    public const APP_TOKEN = 'app_token';
    /** A link that carries a member number or a token. */
    public const URL = 'url';
    /** A secure QR token or the legacy `qr_code_token`. */
    public const TOKEN = 'token';
    /** An NFC card's ID, in hex or decimal. */
    public const CARD = 'card';
    /** A member number, typed in any case, with or without its hyphen. */
    public const NUMBER = 'number';
    /** The digits alone, which exactly one member's number ends with. */
    public const DIGITS = 'digits';
    /** Nothing this organisation has. */
    public const NONE = 'none';

    /**
     * @param string $kind   the scan log's `scan_type`: qr, nfc or manual
     * @param string $result the scan log's `result`: success, member_not_found, invalid_token, expired_token,
     *                       replay_detected, inactive_member
     * @param ?string $value the member number or token read (null when the code itself was used)
     * @param bool $cardOff  an NFC card of this organisation that was switched off
     */
    public function __construct(
        public readonly string $kind,
        public readonly string $form,
        public readonly ?LoyaltyMember $member,
        public readonly string $result,
        public readonly ?string $value = null,
        public readonly bool $cardOff = false,
    ) {
    }

    public function found(): bool
    {
        return $this->result === 'success' && $this->member !== null;
    }

    /**
     * The member the code names whatever their state (release 8, spec 2026-10-25 §1): found, or switched off — a scan
     * at a place or an event shows them and lets AccessDecision say why they may not enter. Null for a code that names
     * nobody, a secure token that cannot be used, and a card that was switched off (its holder may not be the member).
     * The desk's scan and the full admin's keep found().
     */
    public function namedMember(): ?LoyaltyMember
    {
        return $this->member !== null && !$this->cardOff && in_array($this->result, ['success', 'inactive_member'], true) ? $this->member : null;
    }
}
