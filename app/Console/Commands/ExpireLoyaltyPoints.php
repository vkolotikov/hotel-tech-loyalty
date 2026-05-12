<?php

namespace App\Console\Commands;

use App\Services\LoyaltyService;
use Illuminate\Console\Command;

/**
 * Hourly bucket-based points-expiry sweep.
 *
 * LoyaltyService::expirePoints() walks every PointExpiryBucket whose
 * expires_at is in the past, zeroes its remaining_points, decrements the
 * member's current_points, and writes an append-only `expire` row to the
 * ledger. Idempotency-keyed on the bucket id so a re-run of the same tick
 * is a no-op.
 *
 * Pre-fix the method existed but was never scheduled — members kept being
 * shown points they couldn't actually spend, and any redemption against
 * expired buckets silently succeeded (the bucket's remaining_points stayed
 * positive in the DB even though the bucket's expires_at had passed).
 *
 * Hourly cadence: 1h is the largest practical "you might have already
 * spent these points" window we want a member to experience. Daily would
 * leave a member redeeming expired points for up to 24h after midnight.
 */
class ExpireLoyaltyPoints extends Command
{
    protected $signature = 'loyalty:expire-points';
    protected $description = 'Expire loyalty points whose expiry bucket has passed';

    public function handle(LoyaltyService $loyalty): int
    {
        $expired = $loyalty->expirePoints();
        $this->info("Expired {$expired} points across due buckets.");
        return self::SUCCESS;
    }
}
