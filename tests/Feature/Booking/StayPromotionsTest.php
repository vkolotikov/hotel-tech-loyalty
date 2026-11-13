<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use App\Models\BookingPromotion;
use App\Models\BookingRoom;
use App\Models\BookingMirror;
use App\Services\BookingEngineService;
use App\Services\Booking\StayQuoteService;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;
use Tests\Feature\Member\Portal\StayPortalFixture;

class StayPromotionsTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates();
        if (!Schema::hasTable('booking_promotions')) (require database_path('migrations/2026_11_13_120000_create_booking_promotions.php'))->up();
        $this->setting('booking_promotions_enabled', 'true');
        app()->instance('current_organization_id', $this->org->id);
        BookingPromotion::create(['organization_id' => $this->org->id, 'name' => 'Early offer', 'code' => 'EARLYFOR20', 'type' => 'percentage', 'value' => 20, 'currency' => 'EUR',
            'status' => 'published', 'booking_from' => now()->subDay(), 'booking_until' => now()->addDay(), 'min_nights' => 1, 'room_ids' => [], 'excluded_dates' => []]);
        app()->forgetInstance('current_organization_id');
    }

    private function quoteBody(array $extra = []): array
    {
        return $extra + ['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'promo_code' => 'earlyfor20'];
    }

    public function test_public_quote_discounts_accommodation_and_keeps_all_extras(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id, ['name' => 'Sauna', 'price' => 80, 'price_type' => 'per_stay']);
        app()->forgetInstance('current_organization_id');
        $r = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody(['extras' => [['id' => (string) $extra->id, 'quantity' => 1]]]))->assertOk();
        $r->assertJsonPath('room_total', 200)->assertJsonPath('extras_total', 80)->assertJsonPath('discount', 40)->assertJsonPath('gross_total', 240);
        $hold = BookingHold::withoutGlobalScopes()->where('hold_token', $r->json('hold_token'))->sole();
        $this->assertEquals(240, $hold->payload_json['gross_total']);
        $this->assertEquals([40], $hold->payload_json['stay_discount_allocations']);
    }

    public function test_disabled_or_unknown_codes_leave_no_hold_and_no_silent_full_price_booking(): void
    {
        $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody(['promo_code' => 'WRONG']))->assertStatus(422)->assertJsonPath('code', 'promotion_invalid');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count());
        $this->setting('booking_promotions_enabled', 'false');
        $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody())->assertStatus(422)->assertJsonPath('code', 'promotion_unavailable');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count());
    }

    public function test_member_uses_the_best_stay_discount_without_stacking_and_snapshot_survives_edits(): void
    {
        $this->tenPercentOnStays();
        $r = $this->withToken($this->token)->postJson('/api/v1/member/portal/stays/quote', $this->quoteBody())->assertOk();
        $r->assertJsonPath('discount.amount', 40)->assertJsonPath('total_amount', 160);
        BookingPromotion::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['status' => 'paused', 'value' => 5]);
        $hold = BookingHold::withoutGlobalScopes()->where('hold_token', $r->json('hold_token'))->sole();
        app()->instance('current_organization_id', $this->org->id);
        $price = app(StayQuoteService::class)->reprice($this->user, $hold->payload_json);
        $this->assertEquals(160, $price->total);
        $this->assertFalse($price->couponConsumable());
    }

    public function test_another_organizations_code_is_not_usable(): void
    {
        BookingPromotion::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['organization_id' => 999999]);
        $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody())->assertStatus(422)->assertJsonPath('code', 'promotion_invalid');
    }

    public function test_stripe_receives_the_same_discounted_total_with_full_price_extras(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id, ['price' => 80, 'price_type' => 'per_stay']);
        app()->forgetInstance('current_organization_id');
        $q = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody(['extras' => [['id' => (string) $extra->id]]]))->assertOk();
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->once()->with(240.0, Mockery::type('string'), Mockery::on(fn ($m) => $m['hold_token'] === $q->json('hold_token')))->andReturn(['client_secret' => 'test-only', 'payment_intent_id' => 'pi_promotion_fixture']);
        $this->postJson('/api/v1/booking/payment-intent?org=' . $this->org->widget_token, ['hold_token' => $q->json('hold_token')])->assertOk()->assertJsonPath('payment_intent_id', 'pi_promotion_fixture');
    }

    public function test_smoobu_and_booking_keep_the_discount_and_record_one_use_on_replay(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id, ['price' => 80, 'price_type' => 'per_stay']);
        app()->forgetInstance('current_organization_id');
        $q = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody(['extras' => [['id' => (string) $extra->id]]]))->assertOk();
        app()->instance('current_organization_id', $this->org->id);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('getPriceElements')->never();
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(fn ($p) => (float) $p['price'] === 240.0 && (float) $p['priceElements'][0]['amount'] === 160.0 && (float) $p['priceElements'][1]['amount'] === 80.0))->andReturn(['id' => 555100, 'reference-id' => 'PROMO-TEST']);
        $data = ['hold_token' => $q->json('hold_token'), 'guest' => ['first_name' => 'Promo', 'last_name' => 'Guest', 'email' => 'promo@example.test'], 'payment_status' => 'open', 'payment_method' => 'invoice'];
        $engine = app(BookingEngineService::class);
        $engine->confirm($data, 'promotion-test-confirm');
        $engine->confirm($data, 'promotion-test-confirm');
        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('booking_promotion', $mirror->discount_source);
        $this->assertEquals(40, $mirror->discount_amount);
        $this->assertEquals(240, $mirror->price_total);
        $this->assertSame(1, DB::table('booking_promotion_uses')->where('organization_id', $this->org->id)->count());
        $this->assertEquals(40, DB::table('booking_promotion_uses')->where('organization_id', $this->org->id)->value('discount_amount'));
    }

    public function test_member_stay_benefits_never_discount_additional_services_when_feature_is_enabled(): void
    {
        $this->tenPercentOnStays();
        app()->instance('current_organization_id', $this->org->id);
        $extra = $this->seedStayExtra($this->org->id, ['price' => 80, 'price_type' => 'per_stay']);
        app()->forgetInstance('current_organization_id');
        $this->withToken($this->token)->postJson('/api/v1/member/portal/stays/quote', $this->quoteBody(['promo_code' => null, 'extras' => [['id' => (string) $extra->id]]]))
            ->assertOk()->assertJsonPath('discount.amount', 20)->assertJsonPath('lines.extras_total', 80)->assertJsonPath('total_amount', 260);
    }

    public function test_payment_retries_cannot_keep_a_campaign_price_alive_indefinitely(): void
    {
        $q = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody())->assertOk();
        $hold = BookingHold::withoutGlobalScopes()->where('hold_token', $q->json('hold_token'))->sole();
        $hold->update(['expires_at' => now()->addHours(2)]);
        $this->travel(26)->minutes();
        $this->assertFalse($hold->fresh()->isActive());
    }

    public function test_a_fully_discounted_stay_requires_no_stripe_intent(): void
    {
        BookingPromotion::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['type' => 'fixed_amount', 'value' => 500]);
        $q = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody())->assertOk()->assertJsonPath('gross_total', 0);
        $this->stripe()->shouldNotReceive('createPaymentIntent');
        $this->postJson('/api/v1/booking/payment-intent?org=' . $this->org->widget_token, ['hold_token' => $q->json('hold_token')])->assertOk()->assertJsonPath('nothing_to_pay', true);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldNotReceive('getPriceElements');
        $this->smoobu->shouldReceive('createReservation')->once()->with(Mockery::on(fn ($p) => (float) $p['price'] === 0.0))->andReturn(['id' => 555101, 'reference-id' => 'FREE-PROMO-TEST']);
        $this->postJson('/api/v1/booking/confirm?org=' . $this->org->widget_token, [
            'hold_token' => $q->json('hold_token'), 'guest' => ['first_name' => 'Free', 'last_name' => 'Guest', 'email' => 'free@example.test'],
        ])->assertCreated();
        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame('paid', $mirror->payment_status);
        $this->assertSame('promotion', $mirror->payment_method);
        $this->assertEquals(0, $mirror->price_total);
    }

    public function test_multi_room_booking_keeps_selected_room_discounts_and_extras_separate(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $first = BookingRoom::where('pms_id', '101')->firstOrFail();
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden']);
        $extra = $this->seedStayExtra($this->org->id, ['price' => 80, 'price_type' => 'per_stay']);
        BookingPromotion::where('code', 'EARLYFOR20')->firstOrFail()->update(['room_ids' => [$first->id]]);
        $rates = ['101' => ['available' => true, 'price' => 200, 'currency' => 'EUR'], '102' => ['available' => true, 'price' => 300, 'currency' => 'EUR']];
        $this->smoobu->shouldReceive('getRates')->andReturn(['data' => $rates]);
        $this->smoobu->shouldReceive('checkAvailability')->andReturn(['available' => ['101', '102'], 'prices' => ['101' => ['price' => 200], '102' => ['price' => 300]]]);
        $this->smoobu->shouldReceive('getDailyRates')->andReturn(['101' => [$this->checkIn => ['available' => true, 'price' => 100], now()->addDays(11)->toDateString() => ['available' => true, 'price' => 100]], '102' => [$this->checkIn => ['available' => true, 'price' => 150], now()->addDays(11)->toDateString() => ['available' => true, 'price' => 150]]]);
        app()->forgetInstance('current_organization_id');
        $body = $this->quoteBody(['unit_ids' => ['101', '102'], 'adults' => 4, 'extras' => [['id' => (string) $extra->id]]]);
        unset($body['unit_id']);
        $q = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $body)->assertOk()->assertJsonPath('gross_total', 540)->assertJsonPath('stay_discount_allocations', [40, 0]);
        app()->instance('current_organization_id', $this->org->id);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldNotReceive('getPriceElements');
        $prices = [];
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function ($payload) use (&$prices) { $prices[] = $payload['price']; return ['id' => 555000 + count($prices), 'reference-id' => 'COMBO-PROMO-' . count($prices)]; });
        app(BookingEngineService::class)->confirm(['hold_token' => $q->json('hold_token'), 'guest' => ['first_name' => 'Multi', 'last_name' => 'Guest', 'email' => 'multi@example.test'], 'payment_status' => 'open']);
        $this->assertEquals([240, 300], $prices);
        $this->assertEquals(540, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sum('price_total'));
        $this->assertEquals(40, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sum('discount_amount'));
        $this->assertSame(1, DB::table('booking_promotion_uses')->where('organization_id', $this->org->id)->count());
    }

    public function test_payment_recovery_uses_the_booking_writer_and_preserves_retry_on_failure(): void
    {
        (require database_path('migrations/2026_06_01_120200_create_stripe_webhook_events_table.php'))->up();
        $q = $this->postJson('/api/v1/booking/quote?org=' . $this->org->widget_token, $this->quoteBody())->assertOk();
        $event = ['id' => 'evt_promotion_recovery', 'type' => 'payment_intent.succeeded', 'data' => ['object' => ['id' => 'pi_recovery_fixture', 'object' => 'payment_intent', 'amount' => 16000, 'currency' => 'eur', 'metadata' => ['org_id' => (string) $this->org->id, 'hold_token' => $q->json('hold_token')]]]];
        $this->stripe()->shouldReceive('constructWebhookEvent')->andReturn(\Stripe\Event::constructFrom($event));
        $engine = Mockery::mock(BookingEngineService::class);
        $engine->shouldReceive('confirm')->once()->with(Mockery::on(fn ($data) => $data['hold_token'] === $q->json('hold_token') && $data['payment_status'] === 'paid'), 'promotion-recovery:pi_recovery_fixture')->andThrow(new \RuntimeException('Temporary outage'));
        $this->app->instance(BookingEngineService::class, $engine);
        $this->postJson('/api/v1/booking/webhooks/stripe', $event)->assertStatus(500);
        $this->assertSame(0, DB::table('stripe_webhook_events')->where('event_id', 'evt_promotion_recovery')->count());
    }
}
