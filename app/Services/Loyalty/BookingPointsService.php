<?php

namespace App\Services\Loyalty;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\LoyaltyService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Support\Facades\DB;

/**
 * Points for a completed booking: paid amount x the venue's base rate x the
 * member's tier rate x any live multipliers, written once per booking under
 * the ledger's idempotency key and stamped on the booking.
 *
 * Called explicitly from both admin endpoints that can complete a service
 * booking rather than from a model observer: ServiceBookingController::
 * bulk() writes through the query builder and fires no model events, so an
 * observer on ServiceBooking would simply never see that path.
 */
final class BookingPointsService
{
    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    public function awardForServiceBooking(ServiceBooking $booking): ?PointsTransaction
    {
        $orgId = (int) $booking->organization_id;

        if ($booking->status !== 'completed' || $booking->points_awarded_at !== null || !$booking->member_id) {
            return null;
        }
        if ($booking->payment_status === 'refunded' || (float) $booking->total_amount <= 0) {
            return null;
        }
        if (!$this->pointsOnBookingsEnabled($orgId) || !PortalBootstrap::loyaltyOn($orgId)) {
            return null;
        }

        // LoyaltyService::pointsForSpend() reads points_per_currency (and
        // awardPoints() reads points_expiry_months) through
        // HotelSetting::getValue(), which is keyed off whatever org happens
        // to be bound to the container right now -- not necessarily this
        // booking's own org. The member's `tier` relation is scoped the
        // same way (LoyaltyTier's own tenant scope), so it has to be
        // eager-loaded under the same binding too, not fetched first and
        // bound after. Bind the booking's org for the duration of the
        // whole read-compute-write and restore whatever was bound before,
        // so every scoped read here -- and the points_transactions row's
        // own organization_id, forced by BelongsToOrganization's `creating`
        // hook -- is always the booking's, never whichever tenant context
        // happened to be live when this ran.
        return $this->underBookingOrg($orgId, function () use ($booking, $orgId) {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($booking->member_id)
                ->with('tier')
                ->first();
            if (!$member) {
                return null;
            }

            $points = $this->loyalty->pointsForSpend($member, (float) $booking->total_amount);

            $tx = null;
            if ($points > 0) {
                $tx = $this->loyalty->awardPoints(
                    $member,
                    $points,
                    "Appointment {$booking->booking_reference}",
                    'earn',
                    null,
                    'service_booking',
                    $booking->id,
                    (float) $booking->total_amount,
                    null,
                    null,
                    'booking_completed',
                    'service_booking',
                    (string) $booking->id,
                    "booking_points_service_{$booking->id}",
                );
            }

            // Zero computed points still stamps the booking -- otherwise a
            // zero-point completion (e.g. a fully-comped visit) would be
            // retried on every future status touch forever.
            DB::table('service_bookings')->where('id', $booking->id)->update(['points_awarded_at' => now()]);

            return $tx;
        });
    }

    private function pointsOnBookingsEnabled(int $orgId): bool
    {
        $raw = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'points_on_bookings')
            ->value('value');

        return $raw === null || filter_var($raw, FILTER_VALIDATE_BOOLEAN);
    }

    /** Run $fn with current_organization_id bound to $orgId, then restore whatever was bound before. */
    private function underBookingOrg(int $orgId, callable $fn): mixed
    {
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            return $fn();
        } finally {
            if ($prior !== null) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }
    }
}
