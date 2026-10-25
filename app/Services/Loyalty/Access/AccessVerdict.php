<?php

namespace App\Services\Loyalty\Access;

/**
 * What AccessDecision answered for a member at a place or an event (release 8, spec 2026-10-25 §1): granted or not, the
 * reason (one code; the screens say it in words), the membership's end date and how near it is, the member's tier, and
 * — when the tier is the reason — the tiers that are let in.
 */
final class AccessVerdict
{
    /** Refusals, in the order AccessDecision checks them. */
    public const MEMBER_ERASED = 'member_erased';
    public const MEMBER_OFF = 'member_off';
    public const EXPIRED = 'expired';
    public const PLACE_OFF = 'place_off';
    public const TIER_NOT_ALLOWED = 'tier_not_allowed';
    public const EVENT_NOT_OPEN = 'event_not_open';
    public const EVENT_FULL = 'event_full';
    public const NOT_SIGNED_UP = 'not_signed_up';

    /** The one way in. */
    public const WELCOME = 'welcome';

    /**
     * @param array{id: int, name: string, color: ?string}|null $tier
     * @param list<string>                                       $allowedTiers the tiers let in, when the tier was the reason
     */
    public function __construct(
        public readonly bool $granted,
        public readonly string $reason,
        public readonly ?string $validUntil = null,
        public readonly ?int $expiresInDays = null,
        public readonly ?array $tier = null,
        public readonly array $allowedTiers = [],
    ) {
    }

    /** @return array{granted: bool, reason: string, valid_until: ?string, expires_in_days: ?int, tier: ?array, allowed_tiers: list<string>} */
    public function toArray(): array
    {
        return [
            'granted'         => $this->granted,
            'reason'          => $this->reason,
            'valid_until'     => $this->validUntil,
            'expires_in_days' => $this->expiresInDays,
            'tier'            => $this->tier,
            'allowed_tiers'   => $this->allowedTiers,
        ];
    }
}
