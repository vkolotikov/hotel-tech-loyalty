<?php

namespace App\Services\Appointments\Money;

use App\Models\AuditLog;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Models\User;
use App\Services\Appointments\AppointmentActions;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\StaleAppointment;
use App\Services\Loyalty\BookingPointsService;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The money of an appointment (Part E spec §4–§5): what it costs, what was
 * paid online and at the desk, what went back and what is still owed. The
 * one writer of the desk ledger (service_booking_payments) and of the
 * booking's payment label while no card is held online.
 */
final class AppointmentMoney
{
    /** Statuses a payment can be taken in. */
    public const TAKE_FROM = ['pending', 'confirmed', 'in_progress', 'completed'];

    public function __construct(private readonly StripeService $stripe, private readonly BookingPointsService $points)
    {
    }

    /** Any staff member: money taken at the desk, up to what is owed. */
    public function takePayment(int $id, float $amount, string $method, ?string $note, string $revision, User $actor): ServiceBooking
    {
        $amount = round($amount, 2);
        $note = $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 200) : null;
        if (!in_array($method, ServiceBookingPayment::DESK_METHODS, true)) {
            throw new AppointmentRefused('invalid_method', 'Choose how the client paid.', 422);
        }
        if ($method === 'other' && $note === null) {
            throw new AppointmentRefused('note_required', 'Say how the client paid.', 422);
        }
        if ($amount <= 0) {
            throw new AppointmentRefused('invalid_amount', 'Enter an amount above zero.', 422);
        }

        return DB::transaction(function () use ($id, $amount, $method, $note, $revision, $actor) {
            $b = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);
            StaleAppointment::unless($b, $revision);

            $s = self::summary($b);
            if (!$s['can_take']) {
                throw new AppointmentRefused('not_allowed', 'Nothing can be taken for this appointment.', 422);
            }
            if ($amount > $s['owed'] + 0.004) {
                throw new AppointmentRefused('amount_too_large', "At most {$s['owed']} {$s['currency']} is owed.", 422, ['max' => $s['owed']]);
            }

            ServiceBookingPayment::create([
                'service_booking_id' => $b->id, 'kind' => 'payment', 'method' => $method, 'amount' => $amount,
                'currency' => $s['currency'], 'note' => $note, 'actor_user_id' => $actor->id,
            ]);
            $this->settle($b, $actor, 'service_booking.payment_taken', ['amount' => $amount, 'method' => $method], "payment of {$amount} {$s['currency']} ({$method})");

            return $b->fresh();
        });
    }

    /**
     * Managers (checked by the caller): money back, through Stripe or at the
     * desk. `$corrects`: a desk entry made by mistake is undone, and what it
     * covered is owed again (a goodwill refund never re-opens it, R1).
     */
    public function refund(int $id, float $amount, string $via, string $reason, string $revision, User $actor, bool $corrects = false): ServiceBooking
    {
        $b = DB::transaction(function () use ($id, $amount, $via, $reason, $revision, $actor, $corrects) {
            $b = ServiceBooking::lockForUpdate()->find($id)
                ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);
            StaleAppointment::unless($b, $revision);
            $this->refundInLock($b, $amount, $via, $reason, $actor, $corrects);

            return $b;
        });
        $this->afterRefunds($b->fresh(), $actor);

        return $b->fresh();
    }

    /**
     * Every refund line of one step checked against what came in that way,
     * before any of them is made: a card refund is money gone at Stripe, and
     * a later line refused after it would roll back its record but not the
     * money.
     *
     * @param list<array{via: string, amount: float|int|string}> $lines
     */
    public static function assertRefundable(ServiceBooking $b, array $lines): void
    {
        $s = self::summary($b);
        $sum = ['online_card' => 0.0, 'desk' => 0.0];
        foreach ($lines as $l) {
            $sum[(string) $l['via'] === 'online_card' ? 'online_card' : 'desk'] += round((float) $l['amount'], 2);
        }
        foreach ($sum as $via => $amount) {
            self::refuseOver($via, round($amount, 2), $s);
        }
    }

    /** @param array<string, mixed> $s the summary */
    private static function refuseOver(string $via, float $amount, array $s): void
    {
        if ($via === 'online_card' && $amount > $s['refundable_online'] + 0.004) {
            throw new AppointmentRefused('refund_too_large', "At most {$s['refundable_online']} {$s['currency']} can go back to the card.", 422, ['max' => $s['refundable_online']]);
        }
        if ($via !== 'online_card' && $amount > $s['refundable_desk'] + 0.004) {
            throw new AppointmentRefused('refund_too_large', "At most {$s['refundable_desk']} {$s['currency']} was paid at the desk.", 422, ['max' => $s['refundable_desk']]);
        }
    }

    /**
     * One refund inside the caller's transaction, the booking row already
     * locked. A Stripe refund also takes the `pi:` lock (the order the portal
     * and the capture job use: row first, then `pi:`). A Stripe failure
     * throws and the caller's transaction takes the ledger row back (R5).
     * The Stripe idempotency key names the booking, what it had refunded
     * before and this amount: a retry after an answer that never came back
     * (Stripe made the refund, this transaction rolled back) sends the same
     * key and gets the same refund, not a second one.
     */
    public function refundInLock(ServiceBooking $b, float $amount, string $via, string $reason, User $actor, bool $corrects = false): ServiceBookingPayment
    {
        $amount = round($amount, 2);
        $reason = mb_substr(trim($reason), 0, 200);
        if ($reason === '') {
            throw new AppointmentRefused('reason_required', 'Say why the money goes back.', 422);
        }
        if ($amount <= 0) {
            throw new AppointmentRefused('invalid_amount', 'Enter an amount above zero.', 422);
        }
        $s = self::summary($b);
        $base = ['service_booking_id' => $b->id, 'kind' => 'refund', 'amount' => $amount, 'currency' => $s['currency'], 'note' => $reason, 'corrects' => $corrects, 'actor_user_id' => $actor->id];

        if ($corrects) {
            // Only a payment recorded here can have been entered wrongly; a card refund is real money back.
            if (!in_array($via, ServiceBookingPayment::DESK_METHODS, true)) {
                throw new AppointmentRefused('not_allowed', 'Only a payment entered at the desk can be corrected.', 422);
            }
            if ($amount > $s['correctable_desk'] + 0.004) {
                throw new AppointmentRefused('refund_too_large', "At most {$s['correctable_desk']} {$s['currency']} was entered at the desk.", 422, ['max' => $s['correctable_desk']]);
            }
        }

        if ($via === 'online_card') {
            self::refuseOver($via, $amount, $s);
            if (!$this->stripe->isEnabled()) {
                throw new AppointmentRefused('refund_unavailable', 'Online payments are switched off at this venue, so the card cannot be refunded here.', 409);
            }
            $pi = (string) $b->stripe_payment_intent_id;
            AdvisoryLock::within('pi:' . $pi);
            $row = ServiceBookingPayment::create($base + ['method' => 'online_card']);
            $key = "appt-refund-{$b->id}-" . (int) round((float) ($b->refunded_amount ?? 0) * 100) . '-' . (int) round($amount * 100);
            try {
                $refund = $this->stripe->refund($pi, $amount, 'requested_by_customer', $key);
            } catch (\Throwable $e) {
                throw new AppointmentRefused('refund_failed', 'The card refund did not go through: ' . $e->getMessage(), 409);
            }
            $refundId = (string) ($refund->id ?? '');
            $row->forceFill(['stripe_refund_id' => $refundId !== '' ? $refundId : null])->save();
            $b->update([
                'refunded_amount' => round((float) ($b->refunded_amount ?? 0) + $amount, 2),
                'refunded_at'     => now(),
                'last_refund_id'  => $refundId !== '' ? $refundId : $b->last_refund_id,
            ]);
        } elseif (in_array($via, ServiceBookingPayment::DESK_METHODS, true)) {
            self::refuseOver($via, $amount, $s);
            $row = ServiceBookingPayment::create($base + ['method' => $via]);
        } else {
            throw new AppointmentRefused('invalid_method', 'Choose how the money goes back.', 422);
        }

        $this->settle($b, $actor, 'service_booking.refunded', ['amount' => $amount, 'method' => $via, 'reason' => $reason, 'corrects' => $corrects], ($corrects ? 'correction' : 'refund') . " of {$amount} {$s['currency']} ({$via})");

        return $row;
    }

    /** After the refunds commit: a visit whose money all went back gives its points back, once. */
    public function afterRefunds(ServiceBooking $b, User $actor): void
    {
        $s = self::summary($b);
        if ($b->points_awarded_at === null || $s['paid_in'] <= 0 || $s['paid_back'] < $s['paid_in'] - 0.004) {
            return;
        }
        try {
            $this->points->reverseForServiceBooking($b, $actor);
        } catch (\Throwable $e) {
            Log::warning('service_booking.points_reversal_failed', ['id' => $b->id, 'error' => $e->getMessage()]);
        }
    }

    /**
     * The booking page's deposit, charged at Stripe (Part H §5.1): one ledger
     * row — payment, online_card, "Deposit" — and the label from the money,
     * never `paid` for a part. Safe to call twice (confirm() and the capture
     * job both may): the second call finds the row and does nothing.
     */
    public function recordDeposit(ServiceBooking $b, ?User $actor = null): void
    {
        $deposit = Deposits::of($b);
        if ($deposit === null) {
            return;
        }

        DB::transaction(function () use ($b, $deposit, $actor) {
            $locked = ServiceBooking::withoutGlobalScopes()->lockForUpdate()->find($b->id);
            if (!$locked || ServiceBookingPayment::withoutGlobalScopes()->where('service_booking_id', $locked->id)
                    ->where('kind', 'payment')->where('method', 'online_card')->exists()) {
                return;
            }
            $currency = strtoupper((string) ($locked->currency ?: 'EUR'));
            ServiceBookingPayment::create([
                'organization_id' => $locked->organization_id, 'service_booking_id' => $locked->id, 'kind' => 'payment',
                'method' => 'online_card', 'amount' => $deposit['amount'], 'currency' => $currency, 'note' => 'Deposit',
                'actor_user_id' => $actor?->id,
            ]);
            // The card is charged: what came in is the ledger's now, and the label follows it.
            $locked->payment_status = 'unpaid';
            $this->settle($locked, $actor, 'service_booking.deposit_taken', ['amount' => $deposit['amount']], "deposit of {$deposit['amount']} {$currency}");
        });
    }

    /**
     * After a movement: the label from the new figures (never while a card is
     * held online), the booking's money version bumped so every open screen's
     * revision moves — even within the same second, where updated_at alone
     * would not — and the audit row with the actor.
     */
    private function settle(ServiceBooking $b, ?User $actor, string $action, array $new, string $summary): void
    {
        // The label as it was stored: recordDeposit() moves it off "authorized" in memory just before.
        $old = ['payment_status' => (string) $b->getOriginal('payment_status')];
        $meta = (array) ($b->meta ?? []);
        $meta['money_version'] = (int) ($meta['money_version'] ?? 0) + 1;
        // For screens that read the label without the ledger (cardPaid()): this booking's money came in at the desk.
        // A deposit paid on the booking page (online_card) is card money, not the desk's (Part H).
        $meta['paid_at_desk'] = ServiceBookingPayment::withoutGlobalScopes()
            ->where('service_booking_id', $b->id)->where('kind', 'payment')->whereIn('method', ServiceBookingPayment::DESK_METHODS)->exists();
        $patch = ['meta' => $meta];
        $status = self::statusFor(self::summary($b));
        if ($status !== null && $status !== (string) $b->payment_status) {
            $patch['payment_status'] = $status;
        }
        $b->update($patch);
        AuditLog::record($action, $b, $new + ['payment_status' => (string) $b->payment_status], $old, $actor, "Appointment {$b->booking_reference}: {$summary}");
    }

    /** @return array<string, mixed> */
    public static function summary(ServiceBooking $b): array
    {
        $rows = ServiceBookingPayment::withoutGlobalScopes()->with('actor')
            ->where('service_booking_id', $b->id)->orderByDesc('id')->get();

        return self::amountsFrom($b, $rows) + [
            'deposit'   => Deposits::forStaff($b),
            'movements' => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi())->values()->all(),
        ];
    }

    /**
     * Money went back for this visit: a refund recorded here or through Stripe,
     * or a "refunded" label marked before Part E with nothing recorded behind it
     * (polish F10). Reopen refuses such a visit: book it again instead.
     */
    public static function moneyWentBack(ServiceBooking $b): bool
    {
        return in_array((string) $b->payment_status, ['refunded', 'partially_refunded'], true)
            || self::summary($b)['paid_back'] > 0;
    }

    /**
     * Card money Stripe took for this booking. Never when the desk ledger has
     * payments: a payment is only taken while nothing came in online, so a
     * `paid` label beside desk payments is the ledger's own (settle() keeps
     * `meta.paid_at_desk` for screens that do not read the ledger).
     */
    public static function cardPaid(ServiceBooking $b, ?bool $paidAtDesk = null): bool
    {
        $paidAtDesk ??= (bool) (((array) ($b->meta ?? []))['paid_at_desk'] ?? false);

        return !$paidAtDesk && AppointmentActions::carriesCardPayment($b)
            && in_array((string) $b->payment_status, ['paid', 'partially_refunded', 'refunded'], true);
    }

    /** A card hold the capture job will still charge or release; a lapsed one holds nothing. */
    public static function cardHeld(ServiceBooking $b): bool
    {
        return AppointmentActions::carriesCardPayment($b)
            && in_array((string) $b->payment_status, ['authorized', 'pending'], true)
            && !AppointmentActions::holdLapsed($b);
    }

    /** Part H: a closed deposit booking whose deposit is the venue's — a no-show, or cancelled after its deadline. */
    private static function depositKept(ServiceBooking $b): bool
    {
        return (string) $b->status === 'no_show'
            || ((string) $b->status === 'cancelled' && !Deposits::inTime($b, $b->cancelled_at ?? now()));
    }

    /** The label after a movement; null while a card is held online (the capture job owns that label). */
    public static function statusFor(array $s): ?string
    {
        return match (true) {
            $s['held_online'] > 0                   => null,
            $s['paid_in'] <= 0                      => 'unpaid',
            $s['paid_back'] >= $s['paid_in'] - 0.004 => 'refunded',
            $s['paid_back'] > 0                     => 'partially_refunded',
            $s['owed'] > 0                          => 'unpaid',
            // Part H §5.3: a deposit never makes the booking paid, even once nothing more is owed (cancelled, no-show).
            !empty($s['part_paid'])                 => 'unpaid',
            default                                 => 'paid',
        };
    }

    /**
     * summary()'s money figures from ledger rows already loaded, without the
     * movements list: Insights adds up a year of appointments and must not
     * load each row's actor (Part G).
     *
     * @param Collection<int, ServiceBookingPayment> $rows
     * @return array<string, mixed>
     */
    public static function amountsFrom(ServiceBooking $b, Collection $rows): array
    {
        $total = round((float) $b->total_amount, 2);
        $card = AppointmentActions::carriesCardPayment($b);
        $label = (string) $b->payment_status;
        $deposit = Deposits::of($b);
        $payments = $rows->where('kind', 'payment');
        // Part H: a deposit paid on the booking page is card money the ledger records (online_card), not the desk's.
        $online = $payments->where('method', 'online_card');
        $desk = $payments->where('method', '!=', 'online_card');
        $deskRefunds = $rows->where('kind', 'refund')->where('method', '!=', 'online_card');
        $corrections = $deskRefunds->filter(fn (ServiceBookingPayment $r) => (bool) $r->corrects);

        // A deposit booking holds (or took) its deposit, never the whole price.
        $held = self::cardHeld($b) ? ($deposit['amount'] ?? $total) : 0.0;
        $paidOnline = round(($deposit === null && self::cardPaid($b, $desk->isNotEmpty()) ? $total : 0.0) + (float) $online->sum('amount'), 2);
        $refundedOnline = $card ? round((float) ($b->refunded_amount ?? 0), 2) : 0.0;
        $corrected = round((float) $corrections->sum('amount'), 2);
        // A corrected entry was never paid: it leaves the desk money, not the refunds.
        $paidDesk = max(0.0, round((float) $desk->sum('amount') - $corrected, 2));
        $refundedDesk = round((float) $deskRefunds->sum('amount') - $corrected, 2);
        // Marked paid before Part E (R2): a label with no money recorded behind it.
        $legacy = !$card && $payments->isEmpty()
            && ($label === 'paid' || (in_array($label, ['partially_refunded', 'refunded'], true) && $deskRefunds->isNotEmpty()));
        $legacyPaid = $legacy ? $total : 0.0;

        $closed = in_array((string) $b->status, ['cancelled', 'no_show'], true);
        // A refund never makes money owed again (R1); a correction does, since paid_desk leaves it out.
        $owed = ($closed || $legacy) ? 0.0 : max(0.0, round($total - $held - $paidOnline - $paidDesk, 2));
        $paidIn = round($paidOnline + $paidDesk + $legacyPaid, 2);
        $paidBack = round($refundedOnline + $refundedDesk, 2);

        return [
            'total'              => $total,
            'currency'           => strtoupper((string) ($b->currency ?: 'EUR')),
            'held_online'        => $held,
            'paid_online'        => $paidOnline,
            'refunded_online'    => $refundedOnline,
            'paid_desk'          => $paidDesk,
            'refunded_desk'      => $refundedDesk,
            'legacy_marked_paid' => $legacy,
            'owed'               => $owed,
            // A kept deposit is the venue's (Part H): a no-show's, or a cancellation's after the deadline — its card money is
            // not "to refund". One cancelled in time and not given back (Stripe off) is.
            'to_refund'          => $closed ? max(0.0, round($paidIn - $paidBack - ($deposit !== null && self::depositKept($b) ? max(0.0, $paidOnline - $refundedOnline) : 0.0), 2)) : 0.0,
            'refundable_online'  => $paidOnline > 0 ? max(0.0, round($paidOnline - $refundedOnline, 2)) : 0.0,
            'refundable_desk'    => max(0.0, round($paidDesk + $legacyPaid - $refundedDesk, 2)),
            // Only what was entered here can have been entered wrongly (not a label marked paid before Part E).
            'correctable_desk'   => max(0.0, round(min($paidDesk, $paidDesk + $legacyPaid - $refundedDesk), 2)),
            'corrected_desk'     => $corrected,
            'paid_in'            => $paidIn,
            'paid_back'          => $paidBack,
            // A booking-page deposit booking with less in than its price (Part H): its label stays unpaid.
            'part_paid'          => $deposit !== null && $paidIn < $total - 0.004,
            'can_take'           => $owed > 0 && in_array((string) $b->status, self::TAKE_FROM, true),
        ];
    }
}
