<?php

namespace App\Services\Booking;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\BookingPromotion;
use App\Models\BookingRoom;
use App\Models\HotelSetting;
use App\Services\SmoobuClient;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Campaigns price accommodation only. The accepted quote is immutable until its hold expires. */
final class StayPromotions
{
    public static function enabled(): bool
    {
        return filter_var(HotelSetting::getValue('booking_promotions_enabled', false), FILTER_VALIDATE_BOOLEAN);
    }

    public function quote(array $quote, string $code): array
    {
        if (!self::enabled()) $this->refuse('promotion_unavailable', 'Promo codes are not available at this venue.');
        $org = (int) app('current_organization_id');
        $promotion = BookingPromotion::where('organization_id', $org)->where('code', strtoupper(trim($code)))->first();
        if (!$promotion) $this->refuse('promotion_invalid', 'We do not recognise that promo code.');
        $rooms = $quote['rooms'] ?? [['unit_id' => $quote['unit_id'], 'room_total' => $quote['room_total']]];
        $eligible = [];
        foreach ($rooms as $i => $room) {
            $unit = (string) $room['unit_id'];
            $local = BookingRoom::where('organization_id', $org)->where('is_active', true)
                ->where(fn ($q) => $q->where('pms_id', $unit)->orWhere(fn ($q) => $q->where('id', ctype_digit($unit) ? (int) $unit : 0)->where(fn ($q) => $q->whereNull('pms_id')->orWhere('pms_id', ''))))->first();
            $eligible[$i] = $local
                && (!$promotion->brand_id || (int) $local->brand_id === (int) $promotion->brand_id)
                && (!$promotion->room_ids || in_array((int) $local->id, array_map('intval', $promotion->room_ids), true));
        }
        $nightly = [];
        if ($promotion->type === 'second_night_free') {
            // Never invent a free-night price from an average or an unverified fallback rate.
            try {
                $nightly = app(SmoobuClient::class)->getDailyRates($quote['check_in'], $quote['check_out'], array_column($rooms, 'unit_id'));
            } catch (\RuntimeException) {
                $this->refuse('promotion_rate_unavailable', 'We could not verify the free night price. Please try again.');
            }
        }
        $result = self::calculate($promotion->toArray(), $quote, $rooms, $eligible, $nightly, CarbonImmutable::now('UTC'));
        return $result + ['organization_id' => $org, 'brand_id' => $promotion->brand_id,
            'id' => $promotion->id, 'revision' => $promotion->revision, 'code' => $promotion->code, 'name' => $promotion->name,
            'type' => $promotion->type, 'quoted_at' => now()->toIso8601String(),
            'rules' => $promotion->only(['value', 'booking_from', 'booking_until', 'stay_from', 'stay_until', 'min_nights', 'room_ids', 'excluded_dates'])];
    }

    /** Shared deterministic rules, also exercised with unequal nightly rates and timezone boundaries. */
    public static function calculate(array $p, array $quote, array $rooms, array $eligible, array $daily, CarbonImmutable $now): array
    {
        $fail = fn ($code, $message) => throw new PromotionException($code, $message);
        if (($p['status'] ?? '') !== 'published') $fail('promotion_inactive', 'This promo code is not active.');
        if (empty($p['booking_from']) || empty($p['booking_until']) || $now->lt(CarbonImmutable::parse($p['booking_from'])) || $now->gte(CarbonImmutable::parse($p['booking_until']))) {
            $fail('promotion_expired', 'This promo code is outside its booking period.');
        }
        if (strtoupper($p['currency']) !== strtoupper($quote['currency'])) $fail('promotion_currency', 'This promo code is not available in the booking currency.');
        $in = CarbonImmutable::parse($quote['check_in'], 'UTC')->startOfDay();
        $out = CarbonImmutable::parse($quote['check_out'], 'UTC')->startOfDay();
        $nights = (int) $in->diffInDays($out, false);
        $min = max((int) $p['min_nights'], $p['type'] === 'second_night_free' ? 2 : 1);
        if ($nights < $min) $fail('promotion_min_nights', "This promo code requires at least {$min} nights.");
        if ($nights > 3660) $fail('promotion_dates', 'Please choose a shorter stay.');
        for ($day = $in; $day->lt($out); $day = $day->addDay()) {
            $date = $day->toDateString();
            if ((!empty($p['stay_from']) && $date < $p['stay_from']) || (!empty($p['stay_until']) && $date > $p['stay_until'])) $fail('promotion_dates', 'These stay dates are outside the promotion.');
            foreach ($p['excluded_dates'] ?? [] as $range) {
                if ($date >= $range['from'] && $date <= $range['until']) $fail('promotion_dates', 'This stay includes a night excluded from the promotion.');
            }
        }
        $factor = \App\Services\StripeService::smallestUnitOf(1, $quote['currency']);
        $bases = array_map(fn ($r, $ok) => $ok ? max(0, (int) round($r['room_total'] * $factor)) : 0, $rooms, $eligible);
        $base = array_sum($bases);
        if ($base <= 0) $fail('promotion_room', 'This promo code does not apply to the selected accommodation.');
        $discounts = array_fill(0, count($rooms), 0);
        if ($p['type'] === 'second_night_free') {
            $second = $in->addDay()->toDateString();
            foreach ($rooms as $i => $room) {
                if (!$eligible[$i]) continue;
                $cell = $daily[(string) $room['unit_id']][$second] ?? null;
                if (!$cell || empty($cell['available']) || !is_numeric($cell['price'] ?? null) || $cell['price'] <= 0) $fail('promotion_rate_unavailable', 'We could not verify the free night price. Please try again.');
                $discounts[$i] = min($bases[$i], (int) round($cell['price'] * $factor));
            }
        } else {
            $amount = $p['type'] === 'percentage' ? (int) round($base * min(100, max(0, $p['value'])) / 100) : min($base, max(0, (int) round($p['value'] * $factor)));
            $left = $amount;
            $remaining = $base;
            foreach ($bases as $i => $roomBase) {
                $part = $remaining > 0 ? min($roomBase, (int) round($left * $roomBase / $remaining)) : 0;
                $discounts[$i] = $part;
                $left -= $part;
                $remaining -= $roomBase;
            }
        }
        return ['discount' => array_sum($discounts) / $factor, 'room_discounts' => array_map(fn ($x) => $x / $factor, $discounts), 'currency' => $quote['currency']];
    }

    public function applyToQuote(array $quote, ?string $code): array
    {
        if (trim((string) $code) === '') return $quote;
        $hold = BookingHold::where('hold_token', $quote['hold_token'])->firstOrFail();
        try {
            $promotion = $this->quote($quote, $code);
            $changes = self::columns($quote, $promotion);
            $hold->payload_json = array_merge($hold->payload_json, $changes);
            $hold->save();
            return array_merge($quote, $changes);
        } catch (\Throwable $e) {
            $hold->delete();
            throw $e;
        }
    }

    public static function columns(array $quote, array $promotion): array
    {
        return ['promotion' => $promotion, 'promotion_hold_token' => $quote['hold_token'],
            'promotion_expires_at' => now()->addMinutes(25)->toIso8601String(),
            'promotion_accommodation_total' => round($quote['room_total'] - $promotion['discount'], 2),
            'list_total' => round($quote['room_total'] + $quote['extras_total'], 2),
            'discount' => $promotion['discount'], 'discount_source' => 'booking_promotion', 'discount_source_id' => $promotion['id'],
            'discount_label' => $promotion['code'], 'stay_discount_allocations' => $promotion['room_discounts'],
            'gross_total' => round($quote['room_total'] - $promotion['discount'] + $quote['extras_total'], 2)];
    }

    /** Called inside the booking writer's transaction. One use for a whole multi-room booking. */
    public function record(array $payload, BookingMirror $mirror): void
    {
        if (($payload['discount_source'] ?? null) !== 'booking_promotion') return;
        $p = $payload['promotion'];
        DB::table('booking_promotion_uses')->insertOrIgnore([
            'organization_id' => $mirror->organization_id, 'promotion_id' => $p['id'], 'booking_mirror_id' => $mirror->id,
            'hold_token' => $payload['promotion_hold_token'], 'currency' => $p['currency'],
            'discount_amount' => $p['discount'], 'accommodation_total' => $payload['promotion_accommodation_total'],
            'snapshot' => json_encode($p, JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function refuse(string $code, string $message): never
    {
        throw new PromotionException($code, $message);
    }
}
