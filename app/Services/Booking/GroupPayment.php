<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use Illuminate\Support\Collection;

/**
 * One PaymentIntent, several rooms (release 5, part C): a stay booked as a
 * room group — a member-portal combination (StayCombination) or the public
 * widget's own combination — is ONE booking with ONE payment, kept as one
 * `booking_mirror` row per room sharing `booking_group_id`. The first room
 * (the lead) carries the intent in `stripe_payment_intent_id`; the other
 * rooms carry none (NULL — never the same id: production's partial unique
 * index `booking_mirror_org_pi_unique` on (organization_id,
 * stripe_payment_intent_id) refuses a second row with it) and are reached
 * through the lead's group.
 *
 * Every path that finds rows by the intent — the capture job, the Stripe
 * webhooks, a refund — asks here, so the rooms that follow the lead are
 * never left behind (paid, cancelled, refunded or disputed with the rest).
 * A single-room stay is a group of one: rows() is then the one row that
 * carries the intent, exactly what the old by-intent queries found.
 */
final class GroupPayment
{
    /**
     * Every row this intent pays for in this organisation, in id order: the
     * row that carries it, and — when that row leads a room group — the
     * group's rooms that carry no intent of their own. Locked
     * (`lockForUpdate`, one statement, id order) when $lock: the capture
     * job's "row lock(s) first, `pi:` second". The group ids are read first,
     * unlocked — a row's group never changes.
     *
     * @return Collection<int, BookingMirror>
     */
    public static function rows(int $orgId, string $piId, bool $lock = false): Collection
    {
        if ($piId === '') {
            return collect();
        }
        $groups = BookingMirror::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('stripe_payment_intent_id', $piId)
            ->whereNotNull('booking_group_id')
            ->where('booking_group_id', '!=', '')
            ->pluck('booking_group_id')
            ->unique()
            ->values()
            ->all();

        $query = BookingMirror::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where(function ($q) use ($piId, $groups) {
                $q->where('stripe_payment_intent_id', $piId);
                if ($groups !== []) {
                    $q->orWhere(fn ($g) => $g->whereIn('booking_group_id', $groups)->where(fn ($none) => $none->whereNull('stripe_payment_intent_id')->orWhere('stripe_payment_intent_id', '')));
                }
            })
            ->orderBy('id');
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get();
    }

    /**
     * The rooms of $lead's group that follow it (no intent of their own), id
     * order — empty for a row with no group.
     *
     * @return Collection<int, BookingMirror>
     */
    public static function followers(BookingMirror $lead): Collection
    {
        if (empty($lead->booking_group_id)) {
            return collect();
        }

        return BookingMirror::withoutGlobalScopes()
            ->where('organization_id', (int) $lead->organization_id)
            ->where('booking_group_id', (string) $lead->booking_group_id)
            ->whereKeyNot($lead->id)
            ->where(fn ($none) => $none->whereNull('stripe_payment_intent_id')->orWhere('stripe_payment_intent_id', ''))
            ->orderBy('id')
            ->get();
    }

    /**
     * The row that carries $m's payment: $m itself when it carries an intent
     * or belongs to no group; otherwise its group's row that carries one (the
     * lead), or $m when no row of the group carries any (an unpaid group).
     */
    public static function payer(BookingMirror $m): BookingMirror
    {
        if ((string) $m->stripe_payment_intent_id !== '' || empty($m->booking_group_id)) {
            return $m;
        }

        return BookingMirror::withoutGlobalScopes()
            ->where('organization_id', (int) $m->organization_id)
            ->where('booking_group_id', (string) $m->booking_group_id)
            ->whereNotNull('stripe_payment_intent_id')
            ->where('stripe_payment_intent_id', '!=', '')
            ->orderBy('id')
            ->first() ?? $m;
    }

    /**
     * The row of an already-read group that carries the payment (the lead),
     * else the first by id.
     *
     * @param Collection<int, BookingMirror> $rooms
     */
    public static function lead(Collection $rooms): ?BookingMirror
    {
        $sorted = $rooms->sortBy('id')->values();

        return $sorted->first(fn (BookingMirror $m) => (string) $m->stripe_payment_intent_id !== '') ?? $sorted->first();
    }

    /**
     * Where a PART of the one payment that comes back belongs, room by room:
     * first the room the refund was made for ($roomId — the full admin's
     * refund on one room's page), then the rooms that are cancelled (a room
     * staff cancelled on its own is the money the capture job flags as
     * `needs_refund`), each up to what it has left; only what remains is
     * shared between the other rooms in proportion to what each has left.
     * Worked in cents; never more than a room cost. Returns each room's
     * refunded amount AFTER this refund.
     *
     * @param list<array{id: int, total: float, refunded: float, cancelled: bool}> $rooms  in the group's (id) order
     * @return array<int, float>
     */
    public static function allocateRefund(array $rooms, float $amount, ?int $roomId = null): array
    {
        $left = [];
        $after = [];
        foreach ($rooms as $r) {
            $total = max(0, (int) round((float) $r['total'] * 100));
            $done = max(0, min($total, (int) round((float) $r['refunded'] * 100)));
            $after[$r['id']] = $done;
            $left[$r['id']] = $total - $done;
        }
        $rest = max(0, (int) round($amount * 100));

        $take = function (int $id) use (&$rest, &$left, &$after): void {
            $part = min($rest, $left[$id]);
            $after[$id] += $part;
            $left[$id] -= $part;
            $rest -= $part;
        };
        if ($roomId !== null && isset($left[$roomId])) {
            $take($roomId);
        }
        foreach ($rooms as $r) {
            if ($rest > 0 && !empty($r['cancelled'])) {
                $take($r['id']);
            }
        }
        if ($rest > 0) {
            $others = array_values(array_filter(array_keys($left), fn ($id) => $left[$id] > 0));
            $shares = self::refundShares(array_map(fn ($id) => $left[$id] / 100, $others), $rest / 100);
            foreach ($others as $i => $id) {
                $part = min($left[$id], (int) round(($shares[$i] ?? 0) * 100));
                $after[$id] += $part;
                $left[$id] -= $part;
            }
        }

        return array_map(fn (int $c) => round($c / 100, 2), $after);
    }

    /**
     * A payment's refunded money shared between the rooms it paid for, in
     * cents, each room at most its own total: in proportion to the rooms'
     * totals, the first room taking what the rounding leaves, so the shares
     * add up to $refunded exactly (capped at the rooms' sum). One room gets
     * all of it.
     *
     * @param list<float> $totals  each room's price_total, in the group's order
     * @return list<float>
     */
    public static function refundShares(array $totals, float $refunded): array
    {
        $cents = array_map(fn ($t) => max(0, (int) round((float) $t * 100)), array_values($totals));
        $sum = array_sum($cents);
        $left = max(0, min($sum, (int) round($refunded * 100)));
        if ($cents === []) {
            return [];
        }

        $out = array_fill(0, count($cents), 0);
        $rest = $left;
        for ($i = count($cents) - 1; $i >= 1; $i--) {
            $share = $sum > 0 ? (int) floor($left * $cents[$i] / $sum) : 0;
            $out[$i] = min($cents[$i], $share);
            $rest -= $out[$i];
        }
        $out[0] = $rest;
        // The first room cannot take more than its own total: hand the excess on.
        for ($i = 1; $i < count($cents) && $out[0] > $cents[0]; $i++) {
            $move = min($out[0] - $cents[0], $cents[$i] - $out[$i]);
            $out[$i] += $move;
            $out[0] -= $move;
        }

        return array_map(fn (int $c) => round($c / 100, 2), $out);
    }
}
