<?php

namespace App\Services\Appointments;

use App\Models\ServiceBooking;
use App\Services\Loyalty\BookingPointsService;

/**
 * What staff may do to an appointment from the workspace, and what each
 * action will really cause. The panel prints these; it derives nothing.
 *
 * The consequences describe existing behaviour this class does not own:
 *  - the capture job (bookings:capture-pending-pis) charges a held card once
 *    the booking is no longer `pending`, and releases the hold of a booking
 *    that is `cancelled` or `no_show` — but only for HOLD_SWEEP_DAYS after
 *    the booking was made. An older hold is visited by nothing: it is
 *    neither charged nor released, and lapses at Stripe on its own;
 *  - nothing refunds a captured payment on a staff cancellation, and
 *    nothing flags it either: the job never visits a booking already `paid`;
 *  - nothing returns a coupon on a staff cancellation;
 *  - confirm and cancel may email the client (Part D: the staff's "Tell the
 *    client" box, else the venue's setting); no other staff action does.
 */
final class AppointmentActions
{
    /** action => the statuses it is allowed from */
    public const FROM = [
        'confirm'            => ['pending'],
        'start'              => ['confirmed'],
        'complete'           => ['confirmed', 'in_progress'],
        'no_show'            => ['confirmed'],
        'cancel'             => ['pending', 'confirmed', 'in_progress'],
        'mark_paid_at_venue' => ['confirmed', 'in_progress', 'completed'],
        'award_points'       => ['completed'],
    ];

    /** Statuses an appointment can be moved in. `completed`, `cancelled` and `no_show` are final here. */
    public const MOVABLE = ['pending', 'confirmed', 'in_progress'];

    /**
     * How long after a booking is made the capture job still visits its card
     * hold (`$maxAge` in CapturePendingPaymentIntents; the test keeps the two
     * in step).
     */
    public const HOLD_SWEEP_DAYS = 6;

    public function __construct(private readonly BookingPointsService $points)
    {
    }

    /** A real Stripe intent — not none, and not the demo mode's `pi_mock_…`. */
    public static function carriesCardPayment(ServiceBooking $b): bool
    {
        $intent = (string) $b->stripe_payment_intent_id;

        return str_starts_with($intent, 'pi_') && !str_starts_with($intent, 'pi_mock_');
    }

    /**
     * `$preview` is the points preview when the caller already has it (for()
     * works it out once for every action that needs it); null works it out.
     *
     * @param array{points: int, reason: ?string}|null $preview
     */
    public function allowed(ServiceBooking $b, string $action, ?array $preview = null): bool
    {
        if ($action === 'move') {
            return in_array((string) $b->status, self::MOVABLE, true);
        }
        if (!in_array((string) $b->status, self::FROM[$action] ?? [], true)) {
            return false;
        }

        return match ($action) {
            // Only where no payment of any kind is recorded against the booking.
            'mark_paid_at_venue' => (string) $b->payment_status === 'unpaid' && empty($b->stripe_payment_intent_id),
            // Only when the award did not happen and one is due.
            'award_points'       => ($preview ?? $this->points->previewForServiceBooking($b))['points'] > 0,
            default              => true,
        };
    }

    /** @return list<array{key: string, allowed: bool, consequences: array<string, mixed>}> */
    public function for(ServiceBooking $b): array
    {
        // One preview for the whole list: the panel asks for it every 30 seconds.
        $preview = $this->points->previewForServiceBooking($b);

        $out = [];
        foreach ([...array_keys(self::FROM), 'move'] as $action) {
            $out[] = ['key' => $action, 'allowed' => $this->allowed($b, $action, $preview), 'consequences' => $this->consequences($b, $action, $preview)];
        }

        return $out;
    }

    /**
     * @param array{points: int, reason: ?string}|null $preview as allowed()
     * @return array{payment: string, points: ?array{points: int, reason: ?string}, coupon: string, message: string}
     */
    public function consequences(ServiceBooking $b, string $action, ?array $preview = null): array
    {
        $card = self::carriesCardPayment($b);
        $held = $card && in_array((string) $b->payment_status, ['authorized', 'pending'], true);
        $captured = $card && in_array((string) $b->payment_status, ['paid', 'partially_refunded'], true);
        // Past the job's window nothing will charge or release the hold.
        $lapsed = $held && $b->created_at !== null && $b->created_at->lt(now()->subDays(self::HOLD_SWEEP_DAYS));

        return [
            'payment' => match ($action) {
                'confirm'            => $held ? ($lapsed ? 'hold_expired' : 'hold_will_be_charged') : 'none',
                'cancel', 'no_show'  => $held ? ($lapsed ? 'hold_expired' : 'hold_will_be_released') : ($captured ? 'captured_not_refunded' : 'none'),
                'mark_paid_at_venue' => 'marked_only',
                default              => 'none',
            },
            'points'  => in_array($action, ['complete', 'award_points'], true) ? ($preview ?? $this->points->previewForServiceBooking($b)) : null,
            'coupon'  => $action === 'cancel' && in_array((string) $b->discount_source, ['offer', 'reward'], true) ? 'not_returned' : 'none',
            // "ask": the screen offers "Tell the client by email" (Part D).
            'message' => in_array($action, ['confirm', 'cancel'], true) ? 'ask' : 'none',
        ];
    }
}
