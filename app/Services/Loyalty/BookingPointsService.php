<?php

namespace App\Services\Loyalty;

use App\Enums\PaymentStatus;
use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Loyalty\Visits\Visit;
use App\Services\Loyalty\Visits\VisitRecorder;
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
 * application marks that moment. A stay booked through the public widget
 * names no member; it earns when certainMemberForStay() matches it to one
 * member for certain, and the award records that member on the stay.
 */
final class BookingPointsService
{
    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    public function awardForServiceBooking(ServiceBooking $booking): ?PointsTransaction
    {
        $orgId = (int) $booking->organization_id;

        if ($booking->status !== 'completed' || !$booking->member_id || $booking->payment_status === 'refunded') {
            return null;
        }
        // Release 7: the visit — stamp card, cashback, referral, tier counts — counts even with points on bookings
        // off; VisitRecorder is idempotent by the booking, so a repeated call here records nothing twice.
        $this->recordAppointmentVisit($booking);
        if ($booking->points_awarded_at !== null || (float) $booking->total_amount <= 0) {
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
    /**
     * A refunded visit's points go back (Part E: full refunds only, called once
     * what was paid reaches zero). Every earn transaction of this booking not
     * yet reversed is reversed through the ledger's own reversal.
     */
    public function reverseForServiceBooking(ServiceBooking $booking, ?User $staff = null): int
    {
        // Release 7: the visit goes back too — its stamp (an open card only), its cashback, its tier counts.
        app(VisitRecorder::class)->reversed((int) $booking->organization_id, 'service_booking', (int) $booking->id, $staff);

        $total = 0;
        $txs = PointsTransaction::withoutGlobalScopes()
            ->where('reference_type', 'service_booking')->where('reference_id', $booking->id)
            ->where('points', '>', 0)->where('is_reversed', false)->get();
        foreach ($txs as $tx) {
            $this->loyalty->reverseTransaction($tx, "Appointment {$booking->booking_reference} refunded", $staff);
            $total += (int) $tx->points;
        }

        return $total;
    }

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

        // A member's stay, or a widget stay naming a guest that the match below may make a member's.
        if ((!$mirror->member_id && !$mirror->guest_id) || $mirror->points_awarded_at !== null || !$mirror->departure_date) {
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
        if (!$this->pointsOnBookingsEnabled($orgId) || !PortalBootstrap::loyaltyOn($orgId)) {
            return false;
        }

        return $this->memberIdForStay($mirror) !== null;
    }

    /**
     * The member a stay earns for: the one the mirror names (a stay booked in
     * the portal, or one an earlier award recorded), else the member a widget
     * stay certainly belongs to (certainMemberForStay()). Null: nobody's.
     */
    public function memberIdForStay(BookingMirror $mirror): ?int
    {
        return $mirror->member_id ? (int) $mirror->member_id : $this->certainMemberForStay($mirror);
    }

    /**
     * The member a stay booked through the public widget (no member on the
     * mirror) certainly belongs to, or null. Certain means every one of:
     * the stay names a guest and an email; that guest is a guest of the
     * stay's own organisation and is linked to a member; exactly one member
     * of that organisation, active or not, has a user whose email is the
     * stay's (case and surrounding spaces ignored); and that member is the
     * guest's, is active and has verified the address (the portal's own rule
     * for email-matched history: a guest link alone is made by email at
     * sign-up, before anyone proved the address). Anything less is not a
     * match and the stay earns nothing: no guest or an unlinked one, a member
     * of another organisation, another email, two members with the email, an
     * inactive member, an unverified address. Reads only; the award records
     * the member (awardForStay()).
     */
    public function certainMemberForStay(BookingMirror $mirror): ?int
    {
        $orgId = (int) $mirror->organization_id;
        $email = mb_strtolower(trim((string) $mirror->guest_email));
        if ($mirror->member_id || !$mirror->guest_id || $email === '') {
            return null;
        }

        $linked = (int) Guest::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereKey($mirror->guest_id)
            ->value('member_id');
        if ($linked === 0) {
            return null;
        }

        // LOWER/TRIM: the same on PostgreSQL and SQLite (the guest's email
        // column is free text; a member's address may be stored as typed).
        $withEmail = LoyaltyMember::withoutGlobalScopes()
            ->join('users', 'users.id', '=', 'loyalty_members.user_id')
            ->where('loyalty_members.organization_id', $orgId)
            ->whereRaw('LOWER(TRIM(users.email)) = ?', [$email])
            ->limit(2)
            ->get(['loyalty_members.id', 'loyalty_members.is_active', 'users.email_verified_at']);
        if ($withEmail->count() !== 1) {
            return null;
        }
        $only = $withEmail->first();

        return (int) $only->id === $linked && (bool) $only->is_active && $only->email_verified_at !== null ? $linked : null;
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

        // Release 7: a stay that is over counts as a visit even with points on bookings off (no points then).
        $pointsDue = $this->stayIsDue($mirror);
        if (!$pointsDue && !$this->stayVisitIsDue($mirror)) {
            return null;
        }

        return $this->underBookingOrg($orgId, function () use ($mirror, $orgId, $pointsDue) {
            $memberId = $this->memberIdForStay($mirror);
            if ($memberId === null || !$this->recordMember($mirror, $memberId)) {
                return null;
            }
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereKey($memberId)
                ->with('tier')
                ->first();
            if (!$member) {
                return null;
            }

            if (!$pointsDue) {
                $this->recordStayVisit($member, $mirror);

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

            $this->recordStayVisit($member, $mirror);

            return $tx;
        });
    }

    /**
     * Release 7: a stay that is over, at a venue whose points on bookings are off, still counts as the member's visit
     * (stayIsDue() without that one switch). Nothing stamps such a stay, so the nightly run calls this again until it
     * leaves the look-back; VisitRecorder records a stay once.
     */
    public function stayVisitIsDue(BookingMirror $mirror): bool
    {
        $orgId = (int) $mirror->organization_id;
        if ((!$mirror->member_id && !$mirror->guest_id) || $mirror->points_awarded_at !== null || !$mirror->departure_date) {
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

        return PortalBootstrap::loyaltyOn($orgId) && $this->memberIdForStay($mirror) !== null;
    }

    /** Release 7: a completed appointment is the member's visit (VisitRecorder), on the appointment's own day. */
    private function recordAppointmentVisit(ServiceBooking $booking): void
    {
        $orgId = (int) $booking->organization_id;
        if (!PortalBootstrap::loyaltyOn($orgId)) {
            return;
        }
        $this->underBookingOrg($orgId, function () use ($booking, $orgId) {
            $member = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($booking->member_id)->first();
            if (!$member) {
                return;
            }
            // The stored start is the venue's wall clock (never converted): its date is the visit's venue day.
            $start = (string) ($booking->getRawOriginal('start_at') ?? '');
            $day = preg_match('/^\d{4}-\d{2}-\d{2}/', $start) ? substr($start, 0, 10) : PortalBootstrap::venueToday($orgId)->toDateString();
            app(VisitRecorder::class)->record($member, new Visit(
                Visit::APPOINTMENT, 'service_booking', (int) $booking->id, round((float) $booking->total_amount, 2), $day,
            ));
        });
    }

    /** Release 7: a finished stay is the member's visit, on its departure day, with its nights (the tier counters). */
    private function recordStayVisit(LoyaltyMember $member, BookingMirror $mirror): void
    {
        $nights = $mirror->arrival_date && $mirror->departure_date
            ? max(1, (int) $mirror->arrival_date->diffInDays($mirror->departure_date))
            : null;
        app(VisitRecorder::class)->record($member, new Visit(
            Visit::STAY, 'booking_mirror', (int) $mirror->id, round((float) $mirror->price_total, 2), $mirror->departure_date->toDateString(), null, $nights,
        ));
    }

    /**
     * A widget stay matched at award time becomes the member's: its
     * `member_id` is written then, never at booking time (the public widget
     * writes what it always wrote), so the award is made once, a refund
     * finds the member's points, and the portal lists it as theirs. The
     * write is conditional — only while no member is recorded — and a stay
     * that meanwhile names another member is not awarded here. A stay that
     * already names this member passes untouched.
     */
    private function recordMember(BookingMirror $mirror, int $memberId): bool
    {
        if ((int) $mirror->member_id === $memberId) {
            return true;
        }

        $recorded = DB::table('booking_mirror')
            ->where('id', $mirror->id)
            ->whereNull('member_id')
            ->update(['member_id' => $memberId]);
        if ($recorded === 0 && (int) DB::table('booking_mirror')->where('id', $mirror->id)->value('member_id') !== $memberId) {
            return false;
        }
        $mirror->member_id = $memberId;
        $mirror->syncOriginalAttribute('member_id');

        return true;
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
