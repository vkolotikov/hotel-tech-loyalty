<?php

namespace App\Services\Loyalty\Visits;

use App\Models\LoyaltyMember;
use App\Services\NotificationService;
use Illuminate\Support\Facades\Log;

/**
 * "You earned N points" for points a member got at the desk or at an event's door (2026-11-04), as an Award already
 * sends it (`Admin\Loyalty\PointsController::award()`). Before then a check-in or a purchase wrote the points and told
 * the member nothing, so their app showed the old balance until it asked again; the push also makes the members' app
 * refresh. Sent after the visit's transaction, once per new line (never for a request sent again), and never a reason
 * for the visit to fail.
 */
final class PointsNotice
{
    public static function earned(LoyaltyMember $member, int $points): void
    {
        if ($points <= 0) {
            return;
        }
        try {
            app(NotificationService::class)->sendPointsEarned($member, $points);
        } catch (\Throwable $e) {
            Log::warning('loyalty: points earned notice failed', ['member_id' => $member->id, 'error' => $e->getMessage()]);
        }
    }
}
