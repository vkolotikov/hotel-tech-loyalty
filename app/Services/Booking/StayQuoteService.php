<?php

namespace App\Services\Booking;

use App\Models\BookingHold;
use App\Models\BookingRoom;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\User;
use App\Services\BookingEngineService;
use App\Services\MemberProvisioner;
use App\Services\Portal\PortalBootstrap;
use Carbon\CarbonImmutable;

/**
 * The member's price for a stay. The engine quotes the room and writes the
 * hold, exactly as it does for the public widget; this service then prices
 * the hold for the member and writes the member onto it, so the hold can
 * only be paid for and confirmed by the member it was quoted to.
 */
final class StayQuoteService
{
    public function __construct(
        private readonly BookingEngineService $engine,
        private readonly MemberPricing $pricing,
        private readonly MemberProvisioner $provisioner,
    ) {}

    /** @return array{currency: string, min_nights: int, max_nights: int} */
    public function rules(): array
    {
        return StayCatalogue::rules();
    }

    /**
     * The number of nights, once the dates fit the venue's limits. The
     * engine's own quote() checks none of these (only the availability
     * search does), so a request built by hand could otherwise hold and
     * pay for a stay the venue does not sell.
     *
     * @throws StayQuoteException
     */
    public function assertStayAllowed(string $checkIn, string $checkOut): int
    {
        $in = CarbonImmutable::parse($checkIn)->startOfDay();
        $out = CarbonImmutable::parse($checkOut)->startOfDay();
        $nights = (int) $in->diffInDays($out);
        $today = PortalBootstrap::venueToday((int) app('current_organization_id'))->toDateString();
        $rules = $this->rules();

        if ($in->toDateString() < $today || $nights < 1) {
            throw new StayQuoteException('invalid_stay', 'Those dates cannot be booked.', 422);
        }
        if ($nights < $rules['min_nights']) {
            throw new StayQuoteException('invalid_stay', "The shortest stay here is {$rules['min_nights']} nights.", 422);
        }
        if ($nights > $rules['max_nights']) {
            throw new StayQuoteException('invalid_stay', "The longest stay you can book online is {$rules['max_nights']} nights.", 422);
        }

        return $nights;
    }

    /** The member whose tier prices a booking, or null where the venue runs no loyalty programme or the member has no tier. */
    public function pricedMember(User $user): ?LoyaltyMember
    {
        if (!PortalBootstrap::loyaltyOn((int) app('current_organization_id'))) {
            return null;
        }
        $member = $this->provisioner->ensureForUser($user);

        return $member && $member->tier_id ? $member : null;
    }

    /**
     * @param array{unit_id: string, check_in: string, check_out: string, adults?: int, children?: int, extras?: array, coupon?: ?array} $data
     * @return array{hold: BookingHold, engine: array, lines: array, pricing: PricingResult}
     *
     * @throws StayQuoteException  the stay cannot be sold as asked
     * @throws CouponException     the chosen coupon does not resolve
     */
    public function quote(User $user, LoyaltyMember $member, array $data): array
    {
        $orgId = (int) app('current_organization_id');
        $adults = (int) ($data['adults'] ?? 2);
        $children = (int) ($data['children'] ?? 0);
        $nights = $this->assertStayAllowed($data['check_in'], $data['check_out']);

        $room = $this->findRoom($orgId, (string) $data['unit_id']);
        if (!$room) {
            throw new StayQuoteException('not_found', 'We could not find that room.', 404);
        }
        if ($adults + $children > (int) $room->max_guests) {
            throw new StayQuoteException('invalid_stay', "{$room->name} sleeps up to {$room->max_guests}.", 422);
        }

        // The coupon is resolved BEFORE the engine writes a hold: a refused
        // coupon must not leave a hold behind. The caller's own $member —
        // no second MemberProvisioner::ensureForUser() in this request.
        $priced = PortalBootstrap::loyaltyOn($orgId) && $member->tier_id ? $member : null;
        $selection = CouponSelection::fromArray($data['coupon'] ?? null);
        if ($selection && !$priced) {
            throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
        }

        $extras = array_map(fn (array $x) => ['id' => (string) $x['id'], 'quantity' => (int) ($x['quantity'] ?? 1)], $data['extras'] ?? []);
        // The engine's own pricing of the extras (extrasLines(), the function
        // its quote totals them with), read once here and returned as the
        // quote's lines. It prices an unknown id as nothing and skips it; the
        // portal refuses it instead of holding a stay with an extra that is
        // not there.
        $lines = $this->engine->extrasLines($extras, $adults, $children, $nights);
        if (count($lines) !== count($extras)) {
            throw new StayQuoteException('invalid_stay', 'One of the extras you chose is not offered here.', 422);
        }
        try {
            $engine = $this->engine->quote([
                'unit_id' => $room->pms_id ?: (string) $room->id,
                'check_in' => $data['check_in'], 'check_out' => $data['check_out'],
                'adults' => $adults, 'children' => $children, 'extras' => $extras,
            ]);
        } catch (\InvalidArgumentException $e) {
            throw str_contains($e->getMessage(), 'Unknown unit')
                ? new StayQuoteException('not_found', 'We could not find that room.', 404)
                : new StayQuoteException('extra_lead_time', $e->getMessage(), 422);
        } catch (\Illuminate\Database\QueryException $e) {
            // A QueryException extends RuntimeException — without this catch
            // ahead of the one below, a DB error here (our fault) would be
            // reported to the member as "that room is not available", which
            // is not what happened.
            throw $e;
        } catch (\RuntimeException) {
            throw new StayQuoteException('room_unavailable', 'That room is not available for these dates.', 409);
        }

        $hold = BookingHold::withoutGlobalScopes()->where('organization_id', $orgId)->where('hold_token', $engine['hold_token'])->firstOrFail();
        try {
            $pricing = $this->price($priced, (float) $engine['gross_total'], $selection);
        } catch (\Throwable $e) {
            // The engine has already written its hold; a quote that ends in
            // a refusal leaves none behind.
            $hold->delete();
            throw $e;
        }

        $payload = $hold->payload_json;
        $hold->payload_json = array_merge($payload, [
            'member_id'          => (int) $member->id,
            'user_id'            => (int) $user->id,
            'list_total'         => $pricing->list,
            'discount'           => $pricing->discount,
            'discount_source'    => $pricing->applied['source'] ?? null,
            'discount_source_id' => $pricing->applied['source_id'] ?? null,
            'discount_label'     => isset($pricing->applied['label']) ? mb_substr((string) $pricing->applied['label'], 0, 120) : null,
            // Only the known coupon key the selection actually parsed —
            // never the client's raw `coupon` object, which could carry
            // extra keys the hold has no business storing.
            'coupon'             => $selection
                ? ($selection->isOffer() ? ['member_offer_id' => $selection->memberOfferId] : ['redemption_id' => $selection->redemptionId])
                : null,
            'gross_total'        => $pricing->total,
            'channel_name'       => 'Member portal',
        ]);
        $hold->save();

        return ['hold' => $hold, 'engine' => $engine, 'lines' => $lines, 'pricing' => $pricing];
    }

    /**
     * A combination (StayCombination): two or three rooms for one party,
     * quoted by the engine's own quoteCombo() — each room's own price, the
     * extras once, one hold — then priced for the member on the combined list
     * total, exactly as quote() prices one room. The hold also records who
     * sleeps in which room (StayCombination::party()) and the rooms' names
     * together, which the engine's confirm and the confirmation mail read.
     *
     * @param array{unit_ids: list<string>, check_in: string, check_out: string, adults?: int, children?: int, extras?: array, coupon?: ?array} $data
     * @return array{hold: BookingHold, engine: array, lines: array, pricing: PricingResult}
     *
     * @throws StayQuoteException
     * @throws CouponException
     */
    public function quoteCombination(User $user, LoyaltyMember $member, array $data): array
    {
        $orgId = (int) app('current_organization_id');
        $adults = (int) ($data['adults'] ?? 2);
        $children = (int) ($data['children'] ?? 0);
        $nights = $this->assertStayAllowed($data['check_in'], $data['check_out']);

        $unitIds = array_values(array_map('strval', $data['unit_ids'] ?? []));
        if (count($unitIds) < StayCombination::MIN_ROOMS || count($unitIds) > StayCombination::MAX_ROOMS) {
            throw new StayQuoteException('invalid_stay', 'Choose two or three rooms.', 422);
        }
        $rooms = [];
        foreach ($unitIds as $unitId) {
            $room = $this->findRoom($orgId, $unitId);
            if (!$room) {
                throw new StayQuoteException('not_found', 'We could not find that room.', 404);
            }
            $rooms[] = $room;
        }
        // The same room type twice is fine while the venue has that many of it;
        // what is booked over the dates is checked again under the room locks.
        $wanted = [];
        foreach ($rooms as $room) {
            $wanted[$room->id] = ($wanted[$room->id] ?? 0) + 1;
            if ($wanted[$room->id] > max(1, (int) $room->inventory_count)) {
                throw new StayQuoteException('invalid_stay', "We do not have that many of {$room->name}.", 422);
            }
        }
        $party = StayCombination::party(array_map(fn (BookingRoom $r) => (int) $r->max_guests, $rooms), $adults, $children);
        if ($party === null) {
            throw new StayQuoteException('invalid_stay', 'These rooms do not sleep your party, with an adult in every room.', 422);
        }

        $priced = PortalBootstrap::loyaltyOn($orgId) && $member->tier_id ? $member : null;
        $selection = CouponSelection::fromArray($data['coupon'] ?? null);
        if ($selection && !$priced) {
            throw new CouponException('coupon_not_found', 'Coupons need an active membership.');
        }

        $extras = array_map(fn (array $x) => ['id' => (string) $x['id'], 'quantity' => (int) ($x['quantity'] ?? 1)], $data['extras'] ?? []);
        $lines = $this->engine->extrasLines($extras, $adults, $children, $nights);
        if (count($lines) !== count($extras)) {
            throw new StayQuoteException('invalid_stay', 'One of the extras you chose is not offered here.', 422);
        }
        try {
            $engine = $this->engine->quoteCombo([
                'unit_ids' => array_map(fn (BookingRoom $r) => $r->pms_id ?: (string) $r->id, $rooms),
                'check_in' => $data['check_in'], 'check_out' => $data['check_out'],
                'adults' => $adults, 'children' => $children, 'extras' => $extras,
            ]);
        } catch (\InvalidArgumentException $e) {
            throw match (true) {
                str_contains($e->getMessage(), 'Unknown unit') => new StayQuoteException('not_found', 'We could not find that room.', 404),
                str_contains($e->getMessage(), 'capacity')     => new StayQuoteException('invalid_stay', 'These rooms do not sleep your party, with an adult in every room.', 422),
                default                                         => new StayQuoteException('extra_lead_time', $e->getMessage(), 422),
            };
        } catch (\Illuminate\Database\QueryException $e) {
            throw $e;
        } catch (\RuntimeException) {
            throw new StayQuoteException('room_unavailable', 'One of these rooms is not available for these dates.', 409);
        }

        $hold = BookingHold::withoutGlobalScopes()->where('organization_id', $orgId)->where('hold_token', $engine['hold_token'])->firstOrFail();
        try {
            $pricing = $this->price($priced, (float) $engine['gross_total'], $selection);
        } catch (\Throwable $e) {
            $hold->delete();
            throw $e;
        }

        $engineRooms = [];
        foreach (array_values($engine['rooms']) as $i => $r) {
            $engineRooms[] = $r + $party[$i];
        }
        $name = implode(' + ', array_map(fn (array $r) => (string) $r['unit_name'], $engineRooms));

        $hold->payload_json = array_merge($hold->payload_json, [
            'rooms'              => $engineRooms,
            // The confirmation mail and the payment's description name the stay by its rooms.
            'unit_name'          => $name,
            'member_id'          => (int) $member->id,
            'user_id'            => (int) $user->id,
            'list_total'         => $pricing->list,
            'discount'           => $pricing->discount,
            'discount_source'    => $pricing->applied['source'] ?? null,
            'discount_source_id' => $pricing->applied['source_id'] ?? null,
            'discount_label'     => isset($pricing->applied['label']) ? mb_substr((string) $pricing->applied['label'], 0, 120) : null,
            'coupon'             => $selection
                ? ($selection->isOffer() ? ['member_offer_id' => $selection->memberOfferId] : ['redemption_id' => $selection->redemptionId])
                : null,
            'gross_total'        => $pricing->total,
            'channel_name'       => StayCombination::CHANNEL,
        ]);
        $hold->save();

        return ['hold' => $hold, 'engine' => array_merge($engine, ['rooms' => $engineRooms, 'unit_name' => $name]), 'lines' => $lines, 'pricing' => $pricing];
    }

    /**
     * A room of this organisation, active, by StayCatalogue's own key
     * (`pms_id ?: id`): its PMS id, or — only when it HAS no PMS id — its
     * numeric primary key. Without the "only when empty" guard, a request for
     * pms_id '101' could resolve to some other room whose own primary key
     * happens to be 101.
     */
    private function findRoom(int $orgId, string $unitId): ?BookingRoom
    {
        return BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->where(function ($q) use ($unitId) {
                $q->where('pms_id', $unitId);
                if (ctype_digit($unitId)) {
                    $q->orWhere(function ($q2) use ($unitId) {
                        $q2->where('id', (int) $unitId)
                           ->where(fn ($q3) => $q3->whereNull('pms_id')->orWhere('pms_id', ''));
                    });
                }
            })
            ->first();
    }

    /** The hold with this token when this member quoted it; null for anyone else's, the widget's, or none. */
    public function ownHold(LoyaltyMember $member, string $token): ?BookingHold
    {
        $hold = BookingHold::withoutGlobalScopes()
            ->where('organization_id', (int) $member->organization_id)
            ->where('hold_token', $token)
            ->first();

        return $hold && (int) ($hold->payload_json['member_id'] ?? 0) === (int) $member->id ? $hold : null;
    }

    /**
     * The member's price for a hold, computed again from the hold's own
     * list total and coupon: the payment intent and the confirm both charge
     * what this says today, not what the quote said then.
     *
     * @throws CouponException
     */
    public function reprice(User $user, array $payload): PricingResult
    {
        $list = (float) ($payload['list_total'] ?? $payload['gross_total'] ?? 0);

        return $this->price($this->pricedMember($user), $list, CouponSelection::fromArray($payload['coupon'] ?? null));
    }

    /** @param array{hold: BookingHold, engine: array, lines: array, pricing: PricingResult} $quote */
    public function payload(array $quote): array
    {
        $e = $quote['engine'];
        $policies = PortalBootstrap::stayPolicies();
        // A combination (quoteCombination()) names its rooms together and lists each one.
        $combo = !empty($e['is_combo']);

        return [
            'hold_token' => $quote['hold']->hold_token,
            'expires_at' => $quote['hold']->expires_at?->toIso8601String(),
            'room'       => $combo ? ['id' => (string) $e['rooms'][0]['unit_id'], 'name' => (string) $e['unit_name']] : ['id' => (string) $e['unit_id'], 'name' => $e['unit_name']],
            'check_in'   => $e['check_in'], 'check_out' => $e['check_out'], 'nights' => (int) $e['nights'],
            'adults'     => (int) $e['adults'], 'children' => (int) $e['children'],
            'lines'      => [
                'room_total'      => round((float) $e['room_total'], 2),
                'price_per_night' => round($combo ? (float) $e['room_total'] / max(1, (int) $e['nights']) : (float) $e['price_per_night'], 2),
                'extras'          => array_map(fn (array $l) => ['id' => $l['id'], 'name' => $l['name'], 'unit_price' => round($l['unit_price'], 2), 'quantity' => $l['quantity'], 'line_total' => round($l['line_total'], 2)], $quote['lines']),
                'extras_total'    => round((float) $e['extras_total'], 2),
            ],
        ] + ($combo ? ['rooms' => array_map(fn (array $r) => [
            'id'              => (string) $r['unit_id'],
            'name'            => (string) $r['unit_name'],
            'room_total'      => round((float) $r['room_total'], 2),
            'price_per_night' => round((float) $r['price_per_night'], 2),
            'adults'          => (int) $r['adults'],
            'children'        => (int) $r['children'],
        ], $e['rooms'])] : []) + $quote['pricing']->toArray() + [
            'payment' => PortalBootstrap::paymentMode($quote['pricing']->currency),
            'policy'  => [
                'cancellation_policy' => $policies['cancellation_policy'],
                'cancel_hours'        => (int) HotelSetting::getValue('booking_cancel_hours', 48),
                'check_in_time'       => $policies['check_in_time'],
                'check_out_time'      => $policies['check_out_time'],
            ],
        ];
    }

    private function price(?LoyaltyMember $priced, float $list, ?CouponSelection $selection): PricingResult
    {
        $currency = $this->rules()['currency'];

        return $priced
            ? $this->pricing->quote($priced, $list, $currency, BookingScope::Stays, $selection)
            : $this->pricing->quoteWithoutMember($list, $currency);
    }
}
