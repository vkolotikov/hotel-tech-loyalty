<?php

namespace App\Services\Loyalty;

use App\Enums\PaymentStatus;
use App\Models\BookingMirror;
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
 *
 * Stays are awarded by the daily `bookings:award-stay-points` command: a
 * stay is complete when its departure date has passed, and nothing in the
 * application marks that moment.
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

    /**
     * What completing this appointment would award, and when nothing, why.
     * Read-only: the appointments workspace prints it before staff press
     * Complete. The predicates are awardForServiceBooking()'s own, in the
     * order a person would want the reason given — minus the booking's
     * status, since the question is "if it were completed now".
     *
     * @return array{points: int, reason: ?string}
     */
    public function previewForServiceBooking(ServiceBooking $booking): array
    {
        $orgId = (int) $booking->organization_id;
        $none = fn (string $reason): array => ['points' => 0, 'reason' => $reason];

        if ($booking->points_awarded_at !== null) {
            return $none('already_awarded');
        }
        if (!$booking->member_id) {
            return $none('not_a_member');
        }
        if ($booking->payment_status === 'refunded') {
            return $none('refunded');
        }
        if ((float) $booking->total_amount <= 0) {
            return $none('zero_amount');
        }
        if (!PortalBootstrap::loyaltyOn($orgId)) {
            return $none('programme_off');
        }
        if (!$this->pointsOnBookingsEnabled($orgId)) {
            return $none('points_on_bookings_off');
        }

        return $this->underBookingOrg($orgId, function () use ($booking, $orgId, $none) {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($booking->member_id)
                ->with('tier')
                ->first();
            if (!$member) {
                return $none('not_a_member');
            }

            $points = $this->loyalty->pointsForSpend($member, (float) $booking->total_amount);

            return $points > 0 ? ['points' => $points, 'reason' => null] : $none('zero_amount');
        });
    }

    /**
     * Whether awardForStay() would award this stay now — the one rule both
     * the real run and `bookings:award-stay-points --dry-run` read, so the
     * dry run lists exactly what would be awarded: a member's stay not yet
     * stamped, not cancelled or a no-show, its payment collected, departed
     * before the venue's own today, at a venue with points on bookings and
     * a loyalty programme. Reads only; writes nothing.
     */
    public function stayIsDue(BookingMirror $mirror): bool
    {
        $orgId = (int) $mirror->organization_id;

        if (!$mirror->member_id || $mirror->points_awarded_at !== null || !$mirror->departure_date) {
            return false;
        }
        if (in_array((string) $mirror->internal_status, ['cancelled', 'no-show', 'no_show'], true) || (string) $mirror->booking_state === 'cancelled') {
            return false;
        }
        if (!$this->stayPaymentIsCollected($mirror) || (float) $mirror->price_total <= 0) {
            return false;
        }
        if ($mirror->departure_date->toDateString() >= PortalBootstrap::venueToday($orgId)->toDateString()) {
            return false;
        }

        return $this->pointsOnBookingsEnabled($orgId) && PortalBootstrap::loyaltyOn($orgId);
    }

    /**
     * Points for a member's stay once it is over: the day after departure
     * in the venue's own time zone, on what the member paid. The ledger row
     * names the mirror (`booking_mirror`), which is what a later refund
     * reverses (BookingRefundService::reverseLoyaltyPoints()).
     */
    public function awardForStay(BookingMirror $mirror): ?PointsTransaction
    {
        $orgId = (int) $mirror->organization_id;

        if (!$this->stayIsDue($mirror)) {
            return null;
        }

        return $this->underBookingOrg($orgId, function () use ($mirror, $orgId) {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($mirror->member_id)
                ->with('tier')
                ->first();
            if (!$member) {
                return null;
            }

            $points = $this->loyalty->pointsForSpend($member, (float) $mirror->price_total);
            $reference = $mirror->booking_reference ?: $mirror->reservation_id;

            $tx = null;
            if ($points > 0) {
                $tx = $this->loyalty->awardPoints(
                    $member,
                    $points,
                    "Stay {$reference}",
                    'earn',
                    null,
                    'booking_mirror',
                    $mirror->id,
                    (float) $mirror->price_total,
                    null,
                    null,
                    'booking_completed',
                    'booking_mirror',
                    (string) $mirror->id,
                    "booking_points_stay_{$mirror->id}",
                );
            }

            // Zero computed points still stamps the stay, or it would be
            // looked at again every night.
            DB::table('booking_mirror')->where('id', $mirror->id)->update(['points_awarded_at' => now()]);

            return $tx;
        });
    }

    /**
     * Whether the venue has actually taken the member's money for this
     * stay. An allow list, not a block list: `authorized`, `pending`,
     * `capture_expired`, `invoice_waiting` and `channel_managed` all read
     * as "not yet collected" and earn nothing (the stay is left unstamped
     * so a later run -- once the payment settles -- can still award it).
     * `open` only qualifies when the venue collects at the desk
     * (`payment_method === 'pay_at_venue'`); a cancelled/no-show `open`
     * stay is already excluded above by internal_status/booking_state.
     */
    private function stayPaymentIsCollected(BookingMirror $mirror): bool
    {
        $status = (string) $mirror->payment_status;

        if ($status === PaymentStatus::Paid->value) {
            return true;
        }

        return $status === PaymentStatus::Open->value && (string) $mirror->payment_method === 'pay_at_venue';
    }

    public function pointsOnBookingsEnabled(int $orgId): bool
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
