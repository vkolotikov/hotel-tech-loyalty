<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use Illuminate\Support\Collection;

/**
 * A member-portal combination: one stay of one party in two or three rooms,
 * booked in one go (BookingEngineService::confirmCombo() with the portal's
 * hooks). It is ONE booking — one hold, one confirm, one PaymentIntent — kept
 * as one `booking_mirror` row per room (the PMS holds one reservation per
 * room), every row carrying the same `booking_group_id`, the same payment,
 * the portal channel and the same member. The rules about it live here, in
 * one place:
 *
 *   - which rows are one (rooms(), isCombination());
 *   - the order its rooms are locked in (roomLockKeys());
 *   - how the party is shared between the rooms (party());
 *   - how the one price is shared between the rows (shares()), so the rows add
 *     up to what the payment charges, to the cent.
 *
 * The public widget's own combinations (channel `Website`, no member) are not
 * this: nothing here applies to them.
 */
final class StayCombination
{
    public const CHANNEL = 'Member portal';
    public const MIN_ROOMS = 2;
    public const MAX_ROOMS = 3;

    /**
     * The rooms of the member-portal combination $m is one room of, in id
     * order (the first is the lead: the hold remembers it, the coupon carries
     * its reference), or null when $m is not one.
     *
     * @return Collection<int, BookingMirror>|null
     */
    public static function rooms(BookingMirror $m): ?Collection
    {
        if (empty($m->booking_group_id) || (string) $m->channel_name !== self::CHANNEL || empty($m->member_id)) {
            return null;
        }
        $rows = BookingMirror::withoutGlobalScopes()
            ->where('organization_id', (int) $m->organization_id)
            ->where('booking_group_id', (string) $m->booking_group_id)
            ->orderBy('id')
            ->get();

        return self::isCombination($rows) ? $rows : null;
    }

    /** Two or three rows of one organisation, one group id, the portal channel and one member. */
    public static function isCombination(Collection $rows): bool
    {
        if ($rows->count() < self::MIN_ROOMS || $rows->count() > self::MAX_ROOMS) {
            return false;
        }
        $first = $rows->first();
        if (empty($first->booking_group_id) || empty($first->member_id)) {
            return false;
        }

        return $rows->every(fn (BookingMirror $r) => (string) $r->booking_group_id === (string) $first->booking_group_id
            && (int) $r->organization_id === (int) $first->organization_id
            && (string) $r->channel_name === self::CHANNEL
            && (int) $r->member_id === (int) $first->member_id);
    }

    /**
     * The room locks a combination's confirm takes, before anything else:
     * `room:{org}:{unit}` — the single-room confirm's own key — once per unit
     * (a combination may hold two of the same room type), in ascending unit id
     * order, so two confirms that share a room always take their locks in the
     * same order and can never wait on each other in a circle.
     *
     * @param list<string|int> $unitIds
     * @return list<string>
     */
    public static function roomLockKeys(int $orgId, array $unitIds): array
    {
        $ids = array_values(array_unique(array_map('strval', $unitIds)));
        sort($ids, SORT_NATURAL);

        return array_map(fn (string $id) => "room:{$orgId}:{$id}", $ids);
    }

    /**
     * Who sleeps in which room: one adult in every room first, then each room
     * filled in turn up to what it sleeps (adults before children). Null when
     * the rooms cannot take the party that way — fewer adults than rooms, or
     * not enough beds.
     *
     * @param list<int> $capacities  each room's max_guests, in the combination's order
     * @return list<array{adults: int, children: int}>|null
     */
    public static function party(array $capacities, int $adults, int $children): ?array
    {
        $n = count($capacities);
        if ($n < self::MIN_ROOMS || $adults < $n || $children < 0 || array_sum($capacities) < $adults + $children) {
            return null;
        }
        $out = [];
        $adultsLeft = $adults - $n;
        $childrenLeft = $children;
        foreach ($capacities as $cap) {
            $free = (int) $cap - 1;
            if ($free < 0) {
                return null;
            }
            $a = min($adultsLeft, $free);
            $adultsLeft -= $a;
            $free -= $a;
            $c = min($childrenLeft, $free);
            $childrenLeft -= $c;
            $out[] = ['adults' => 1 + $a, 'children' => $c];
        }

        return $adultsLeft === 0 && $childrenLeft === 0 ? $out : null;
    }

    /**
     * The one price shared between the rows. Each room's list price is its own
     * accommodation (the extras belong to the first room, as the engine bills
     * them); the discount is shared in proportion to those list prices; the
     * first room takes whatever the rounding leaves, so the rows' totals add up
     * to $grossTotal exactly and no row's discount exceeds its list price.
     * Worked in cents.
     *
     * @param list<float> $roomTotals  each room's accommodation total, in the combination's order
     * @return list<array{list: float, discount: float, total: float}>
     */
    public static function shares(array $roomTotals, float $extrasTotal, float $grossTotal): array
    {
        $lists = [];
        foreach (array_values($roomTotals) as $i => $room) {
            $lists[] = (int) round(((float) $room + ($i === 0 ? $extrasTotal : 0.0)) * 100);
        }
        $list = array_sum($lists);
        $gross = max(0, min($list, (int) round($grossTotal * 100)));
        $discount = $list - $gross;

        $totals = [];
        $rest = $gross;
        for ($i = count($lists) - 1; $i >= 1; $i--) {
            $share = $list > 0 ? (int) round($discount * $lists[$i] / $list) : 0;
            $totals[$i] = max(0, min($lists[$i], $lists[$i] - $share));
            $rest -= $totals[$i];
        }
        $totals[0] = $rest;
        // The rounding of the other rooms can, in a corner, leave the first
        // room more than its own list price or less than nothing: move the
        // excess onto the others, which still have room for it.
        for ($i = 1; $i < count($lists) && ($totals[0] > $lists[0] || $totals[0] < 0); $i++) {
            $move = $totals[0] > $lists[0]
                ? min($totals[0] - $lists[0], $lists[$i] - $totals[$i])
                : -min(-$totals[0], $totals[$i]);
            $totals[$i] += $move;
            $totals[0] -= $move;
        }
        ksort($totals);

        $out = [];
        foreach ($lists as $i => $l) {
            $out[] = ['list' => round($l / 100, 2), 'discount' => round(($l - $totals[$i]) / 100, 2), 'total' => round($totals[$i] / 100, 2)];
        }

        return $out;
    }
}
