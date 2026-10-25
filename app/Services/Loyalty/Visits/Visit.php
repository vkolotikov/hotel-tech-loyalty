<?php

namespace App\Services\Loyalty\Visits;

use App\Models\User;

/**
 * One visit of a member (release 7, spec 2026-10-25 §2): a completed appointment, a finished stay, a desk check-in or a
 * purchase entered at the desk. `amount` is what was spent (null for a plain check-in); `venueDay` is the day on the
 * venue's clock (Y-m-d) — at most one stamp per member per venue day.
 */
final class Visit
{
    public const APPOINTMENT = 'appointment';
    public const STAY = 'stay';
    public const CHECK_IN = 'check_in';
    public const PURCHASE = 'purchase';

    public function __construct(
        public readonly string $source,
        public readonly ?string $referenceType,
        public readonly ?int $referenceId,
        public readonly ?float $amount,
        public readonly string $venueDay,
        public readonly ?User $by = null,
        /** A finished stay's nights (tier counters); null for other visits. */
        public readonly ?int $nights = null,
    ) {
    }
}
