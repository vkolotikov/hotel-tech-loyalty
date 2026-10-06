<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Booking\CouponRelease;
use App\Services\Loyalty\BookingPointsService;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Runs one staff action on an appointment: under the row lock, against the
 * revision the client saw, through the transition table. It writes the
 * appointment's own status (payments and refunds are AppointmentMoney's) and
 * nothing else — no payment, refund or message is triggered from here. The
 * one side effect, points for a completed visit, is the existing worker's,
 * called once after the transaction commits.
 */
final class AppointmentActionRunner
{
    public function __construct(
        private readonly AppointmentActions $actions,
        private readonly BookingPointsService $points,
        private readonly AppointmentMoney $money,
        private readonly CouponRelease $coupons,
    ) {
    }

    /**
     * @param list<array{via: string, amount: float|int|string}> $refunds cancel only, managers only (Part E)
     * @return array{booking: ServiceBooking, points: ?array{awarded: int, reason: ?string}}
     */
    public function run(int $id, string $action, string $revision, ?string $reason, User $actor, array $refunds = []): array
    {
        if (!array_key_exists($action, AppointmentActions::FROM)) {
            throw new AppointmentRefused('not_allowed', 'That action is not available.', 422);
        }
        $refunds = array_values(array_filter($refunds, fn (array $r) => round((float) ($r['amount'] ?? 0), 2) > 0));
        if ($refunds !== [] && $action !== 'cancel') {
            throw new AppointmentRefused('not_allowed', 'Money goes back only with a cancellation or a refund.', 422);
        }
        // Refunds (Part E) and reopening (Part F) are managers' only.
        if ($refunds !== [] || $action === 'reopen') {
            SetupAccess::requireManager($actor);
        }

        $preview = null;

        $work = function () use ($id, $action, $revision, $reason, $actor, $refunds, &$preview) {
            $booking = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

            StaleAppointment::unless($booking, $revision);

            if (!$this->actions->allowed($booking, $action)) {
                throw new AppointmentRefused('not_allowed', "This appointment is {$booking->status}; that action is not available.", 422);
            }
            if ($action === 'reopen') {
                $this->assertReopenable($booking);
            }
            if (in_array($action, ['complete', 'award_points'], true)) {
                $preview = $this->points->previewForServiceBooking($booking);
            }

            $old = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];
            if ($action === 'reopen') {
                // What reopening clears, kept in the audit row.
                $old['cancelled_at'] = $booking->cancelled_at?->toIso8601String();
                $old['cancellation_reason'] = $booking->cancellation_reason;
            }
            $reason = $reason !== null && trim($reason) !== '' ? mb_substr(trim($reason), 0, 255) : null;

            // Cancel with refund (Part E): the money first, under this same row lock; a refused or failed refund
            // throws and nothing — not even the cancellation — is kept. Every line is checked before any is made,
            // and the desk lines go before the card: once Stripe has refunded, nothing after it may refuse.
            if ($refunds !== []) {
                AppointmentMoney::assertRefundable($booking, $refunds);
                usort($refunds, fn (array $a, array $b) => ((string) $a['via'] === 'online_card') <=> ((string) $b['via'] === 'online_card'));
            }
            foreach ($refunds as $r) {
                $this->money->refundInLock($booking, (float) $r['amount'], (string) $r['via'], $reason ?? 'Appointment cancelled', $actor);
            }

            $patch = match ($action) {
                'confirm'            => ['status' => 'confirmed'],
                'start'              => ['status' => 'in_progress'],
                'complete'           => ['status' => 'completed'],
                'no_show'            => ['status' => 'no_show'],
                'cancel'             => ['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $reason],
                'reopen'             => ['status' => 'confirmed', 'cancelled_at' => null, 'cancellation_reason' => null],
                'award_points'       => [],
            };
            if ($patch !== []) {
                $booking->update($patch);
            }

            $new = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];
            if ($action === 'cancel') {
                $new['cancellation_reason'] = $reason;
            }
            AuditLog::record("service_booking.{$action}", $booking, $new, $old, $actor, "Appointment {$booking->booking_reference}: {$action}");

            return $booking;
        };

        // Reopen checks the person's own time: their `svcm:` lock first, then the row — StaffBookingWriter's order.
        $booking = $action === 'reopen'
            ? AdvisoryLock::transaction('svcm:' . (int) ServiceBooking::whereKey($id)->value('service_master_id'), $work)
            : DB::transaction($work);

        if ($refunds !== []) {
            $this->money->afterRefunds($booking->fresh(), $actor);
        }

        $points = null;
        if ($preview !== null) {
            $awarded = 0;
            $failed = false;
            try {
                $awarded = (int) ($this->points->awardForServiceBooking($booking->fresh())?->points ?? 0);
            } catch (\Throwable $e) {
                // The status is saved; the award is not. The panel says so and
                // offers "Award points" (the same worker, safe to run again).
                $failed = true;
                Log::warning('service_booking.points_failed', ['id' => $booking->id, 'error' => $e->getMessage()]);
            }
            $fresh = $booking->fresh();
            // Nothing awarded although the preview promised points: someone
            // else (the full admin completing the same visit) got there
            // first, or a rule changed in between. The booking as it is now
            // says which.
            $points = [
                'awarded' => $awarded,
                'reason'  => $awarded > 0 ? null : ($failed
                    ? 'failed'
                    : ($preview['reason'] ?? $this->points->previewForServiceBooking($fresh)['reason'] ?? 'zero_amount')),
            ];

            return ['booking' => $fresh, 'points' => $points];
        }

        return ['booking' => $booking->fresh(), 'points' => $points];
    }

    /**
     * Part F: a visit closed by mistake goes back only when no money went
     * back for it (the money summary would no longer tell the truth) and its
     * own time is still free of live appointments. Working hours and "a day
     * that has passed" are not checked: reopening restores a record.
     */
    private function assertReopenable(ServiceBooking $b): void
    {
        if (AppointmentMoney::summary($b)['paid_back'] > 0) {
            throw new AppointmentRefused('money_returned', 'Money was given back for this visit — book it again instead.', 422);
        }
        // A portal cancellation gives the member's coupon back (CouponRelease); reopening would use it twice.
        if (in_array((string) $b->discount_source, ['offer', 'reward'], true) && $b->discount_source_id
            && !$this->coupons->stillUsedBy((string) $b->discount_source, (int) $b->discount_source_id, (string) $b->booking_reference)) {
            throw new AppointmentRefused('coupon_returned', 'The coupon used on this visit was given back to the member — book it again instead.', 422);
        }

        // MOVABLE is the scheduler's own set of statuses that take a person's time.
        $clash = ServiceBooking::where('service_master_id', $b->service_master_id)
            ->whereIn('status', AppointmentActions::MOVABLE)
            ->where('id', '!=', $b->id)
            ->where('start_at', '<', $b->end_at)
            ->where('end_at', '>', $b->start_at)
            ->exists();
        if ($clash) {
            throw new AppointmentRefused('slot_taken', 'That time is taken now — book the client again at another time.', 409);
        }
    }
}
