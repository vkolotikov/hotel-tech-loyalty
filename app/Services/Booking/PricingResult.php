<?php

namespace App\Services\Booking;

/**
 * The member price of a booking: DiscountService::quoteForBooking()'s
 * output, carried in the booking's own currency.
 */
final readonly class PricingResult
{
    public function __construct(
        public float $list,
        public float $discount,
        public float $total,
        public ?array $applied,
        public ?array $coupon,
        public string $currency,
    ) {}

    /** True when the applied discount is the member's chosen coupon (an offer or a reward), not an automatic tier benefit. */
    public function couponConsumable(): bool
    {
        return $this->applied !== null && in_array($this->applied['source'], ['offer', 'reward'], true);
    }

    public function toArray(): array
    {
        return [
            'list_amount'  => $this->list,
            'discount'     => $this->applied ? ['amount' => $this->discount, 'label' => $this->applied['label'], 'source' => $this->applied['source']] : null,
            'coupon'       => $this->coupon,
            'total_amount' => $this->total,
            'currency'     => $this->currency,
        ];
    }
}
