<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BenefitDefinition;
use App\Models\HotelSetting;
use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Models\User;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Support\Facades\Mail;
use Mockery;

/**
 * A hotel with one room (101 "Sea view", two guests, 100.00 a night), one
 * member signed in through the real register endpoint, and Smoobu replaced
 * by a Mockery mock in the container — no test here makes an HTTP call.
 *
 * For classes that extend MemberEndpointTestCase and also
 * `use SetsUpStayBookingSchema, SeedsDiscountFixture` (the latter declares
 * `$member` and the discount tables).
 */
trait StayPortalFixture
{
    protected Organization $org;
    protected User $user;
    protected string $token;
    protected $smoobu;
    protected string $checkIn;
    protected string $checkOut;

    protected function setUpStayPortal(): void
    {
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        Mail::fake();

        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member, 'user' => $this->user] = $this->member($this->org);

        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);
        app()->forgetInstance('current_organization_id');

        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
    }

    protected function setting(string $key, string $value): void
    {
        // organization_id is not fillable on HotelSetting (BelongsToOrganization
        // sets it from the bound tenant), so it is set on the model directly.
        $row = HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->first() ?? new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        $row->group = 'booking';
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    /** Stripe enabled in EUR, as a mock that records what it was asked. */
    protected function stripe(bool $enabled = true, string $currency = 'eur'): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn($enabled);
        $stripe->shouldReceive('currency')->andReturn($currency);
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $this->app->instance(StripeService::class, $stripe);
        return $stripe;
    }

    /** Smoobu prices room 101 at $total for the fixture's two nights and says it is free. */
    protected function smoobuRates(float $total = 200.0): void
    {
        $rate = ['available' => true, 'price' => $total, 'price_per_night' => round($total / 2, 2), 'min_stay' => 1, 'currency' => 'EUR'];
        $this->smoobu->shouldReceive('getDailyRates')->byDefault()->andReturn([]);
        $this->smoobu->shouldReceive('getRates')->byDefault()->andReturn(['data' => ['101' => $rate]]);
        $this->smoobu->shouldReceive('checkAvailability')->byDefault()->andReturn(['available' => ['101'], 'prices' => ['101' => ['price' => $total]]]);
    }

    protected function tenPercentOnStays(): void
    {
        $def = BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off stays', 'code' => 'ten-stays', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'stays', 'is_active' => true]);
    }

    protected function claim(float $value, string $type = 'fixed_amount', string $appliesTo = 'all'): MemberOffer
    {
        $offer = SpecialOffer::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'title' => "$value off", 'description' => '-', 'type' => $type, 'value' => $value, 'applies_to' => $appliesTo, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(30)->toDateString(), 'is_active' => true]);
        return MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);
    }
}
