<?php

namespace App\Services\Loyalty\Visits;

/**
 * What a visit gave (release 7): the stamp card after it (or why no stamp), the credit earned, and anything that failed
 * — each effect runs on its own, so one failing never takes the others or the booking with it.
 */
final class VisitOutcome
{
    /**
     * @param array<string, mixed>|null $stamp  StampCards::stamp()'s answer: the card after the stamp, or `['added' => false, 'reason' => …]`
     * @param array<string, mixed>|null $credit CreditLedger::earnCashback()'s answer: the line and the balance, or null when none
     * @param list<string>              $failed the effects that threw (logged and audited `loyalty.visit_effect_failed`)
     */
    public function __construct(
        public ?array $stamp = null,
        public ?array $credit = null,
        public bool $referralQualified = false,
        public array $failed = [],
    ) {
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return ['stamp' => $this->stamp, 'credit' => $this->credit, 'referral_qualified' => $this->referralQualified, 'failed' => $this->failed];
    }
}
