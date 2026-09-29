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
        $this->assertStayAllowed($data['check_in'], $data['check_out']);

        // Mirror StayCatalogue's own key (`pms_id ?: id`): a room is found
        // by its PMS id, or — only when it HAS no PMS id — by its numeric
        // primary key. Without the "only when empty" guard, a request for
        // pms_id '101' could resolve to some other room whose own primary
        // key happens to be 101.
        $unitId = (string) $data['unit_id'];
        $room = BookingRoom::withoutGlobalScopes()
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
        $lines = $this->engine->extrasLines($extras, $adults);
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

        return [
            'hold_token' => $quote['hold']->hold_token,
            'expires_at' => $quote['hold']->expires_at?->toIso8601String(),
            'room'       => ['id' => (string) $e['unit_id'], 'name' => $e['unit_name']],
            'check_in'   => $e['check_in'], 'check_out' => $e['check_out'], 'nights' => (int) $e['nights'],
            'adults'     => (int) $e['adults'], 'children' => (int) $e['children'],
            'lines'      => [
                'room_total'      => round((float) $e['room_total'], 2),
                'price_per_night' => round((float) $e['price_per_night'], 2),
                'extras'          => array_map(fn (array $l) => ['id' => $l['id'], 'name' => $l['name'], 'unit_price' => round($l['unit_price'], 2), 'quantity' => $l['quantity'], 'line_total' => round($l['line_total'], 2)], $quote['lines']),
                'extras_total'    => round((float) $e['extras_total'], 2),
            ],
        ] + $quote['pricing']->toArray() + [
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
