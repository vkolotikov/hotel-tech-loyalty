<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\User;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Runs one staff action on an appointment: under the row lock, against the
 * revision the client saw, through the transition table. It writes the
 * appointment's own status (or, for "paid at venue", the payment label) and
 * nothing else — no payment, refund or message is triggered from here. The
 * one side effect, points for a completed visit, is the existing worker's,
 * called once after the transaction commits.
 */
final class AppointmentActionRunner
{
    public function __construct(
        private readonly AppointmentActions $actions,
        private readonly BookingPointsService $points,
    ) {
    }

    /** @return array{booking: ServiceBooking, points: ?array{awarded: int, reason: ?string}} */
    public function run(int $id, string $action, string $revision, ?string $reason, User $actor): array
    {
        if (!array_key_exists($action, AppointmentActions::FROM)) {
            throw new AppointmentRefused('not_allowed', 'That action is not available.', 422);
        }

        $preview = null;

        $booking = DB::transaction(function () use ($id, $action, $revision, $reason, $actor, &$preview) {
            $booking = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

            StaleAppointment::unless($booking, $revision);

            if (!$this->actions->allowed($booking, $action)) {
                throw new AppointmentRefused('not_allowed', "This appointment is {$booking->status}; that action is not available.", 422);
            }
            if (in_array($action, ['complete', 'award_points'], true)) {
                $preview = $this->points->previewForServiceBooking($booking);
            }

            $old = ['status' => (string) $booking->status, 'payment_status' => (string) $booking->payment_status];
            $reason = $reason !== null && trim($reason) !== '' ? mb_substr(trim($reason), 0, 255) : null;

            $patch = match ($action) {
                'confirm'            => ['status' => 'confirmed'],
                'start'              => ['status' => 'in_progress'],
                'complete'           => ['status' => 'completed'],
                'no_show'            => ['status' => 'no_show'],
                'cancel'             => ['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $reason],
                'mark_paid_at_venue' => ['payment_status' => 'paid'],
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
        });

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
}
