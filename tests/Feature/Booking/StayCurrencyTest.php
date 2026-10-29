<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\AvailabilityService;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * Release 6, item 7: a stay is held, receipted and answered in the venue's own
 * stay currency — `booking_currency`, the one the member portal reports for
 * stays — instead of a literal EUR. For a EUR venue (or one that never set the
 * field) every answer is exactly what it was: the hold's and the quote's
 * `currency`, the confirm response's, Smoobu's `currencyCode` and the receipt's
 * "€" amounts. For another currency: its code, and the receipt writes
 * "USD 200.00" (a zero-decimal currency without decimals, "JPY 12000"). A hold
 * keeps the currency it was quoted in.
 */
class StayCurrencyTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    protected Organization $org;
    protected $smoobu;
    protected BookingEngineService $engine;
    protected string $checkIn;
    protected string $checkOut;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        Mail::fake();

        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden', 'base_price' => 80, 'sort_order' => 1]);
        $this->checkIn = now()->addDays(10)->toDateString();
        $this->checkOut = now()->addDays(12)->toDateString();

        $avail = Mockery::mock(AvailabilityService::class);
        $avail->shouldReceive('unitRates')->andReturn(['available' => true, 'price' => 200.0, 'price_per_night' => 100.0]);
        $this->app->instance(AvailabilityService::class, $avail);

        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $nights = [];
        for ($d = now()->addDays(10); $d->toDateString() < $this->checkOut; $d = $d->copy()->addDay()) {
            $nights[$d->toDateString()] = ['available' => true, 'price' => 100.0, 'min_stay' => 1];
        }
        $this->smoobu->shouldReceive('getDailyRates')->andReturnUsing(fn ($in, $out, array $units) => collect($units)->mapWithKeys(fn ($u) => [(string) $u => $nights])->all());
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([]);
        $this->engine = new BookingEngineService($this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function venueCurrency(string $code): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'booking_currency', 'value' => $code, 'type' => 'string', 'group' => 'booking']);
        HotelSetting::flushCacheFor($this->org->id);
        \App\Models\BookingRoom::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['currency' => strtoupper($code)]);
    }

    public function test_a_room_or_selected_extra_in_another_currency_cannot_be_added_to_a_quote(): void
    {
        $this->venueCurrency('USD');
        \App\Models\BookingRoom::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('pms_id', '102')->update(['currency' => 'EUR']);
        try {
            $this->engine->quoteCombo(['unit_ids' => ['101', '102'], 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 3]);
            $this->fail('Mixed currencies were quoted');
        } catch (\App\Services\Booking\CurrencyMismatch) {
            $this->assertSame(0, BookingHold::count());
        }
        $extra = $this->seedStayExtra($this->org->id, ['currency' => 'EUR', 'price' => 10]);
        $this->expectException(\App\Services\Booking\CurrencyMismatch::class);
        $this->engine->quote(['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'extras' => [['id' => (string) $extra->id]]]);
    }

    public function test_a_provider_rate_in_another_currency_is_not_relabelled(): void
    {
        $avail = Mockery::mock(AvailabilityService::class);
        $avail->shouldReceive('unitRates')->andReturn(['available' => true, 'price' => 200, 'currency' => 'USD']);
        $this->app->instance(AvailabilityService::class, $avail);
        $this->expectException(\App\Services\Booking\CurrencyMismatch::class);
        $this->engine->quote(['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut]);
    }

    public function test_new_rooms_and_extras_default_to_the_venue_currency(): void
    {
        $this->venueCurrency('USD');
        $room = app(\App\Http\Controllers\Api\V1\Admin\BookingRoomController::class)->store(\Illuminate\Http\Request::create('/', 'POST', ['name' => 'New room']))->getData(true);
        $extra = app(\App\Http\Controllers\Api\V1\Admin\BookingExtraController::class)->store(\Illuminate\Http\Request::create('/', 'POST', ['name' => 'Breakfast', 'price' => 10]))->getData(true);
        $this->assertSame('USD', $room['currency']);
        $this->assertSame('USD', $extra['currency']);
    }

    public function test_a_saved_quote_is_not_authorized_in_a_new_venue_currency(): void
    {
        $quote = $this->engine->quote(['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut]);
        $this->venueCurrency('USD');
        $stripe = Mockery::mock(\App\Services\StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('currency')->andReturn('usd');
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_fixture');
        $stripe->shouldNotReceive('createPaymentIntent');
        $this->app->instance(\App\Services\StripeService::class, $stripe);
        $this->postJson('/api/v1/booking/payment-intent?org=' . $this->org->fresh()->widget_token, ['hold_token' => $quote['hold_token']])
            ->assertStatus(422)->assertJsonPath('code', 'currency_mismatch');
    }

    public function test_currency_backfill_preserves_metadata_and_currency_written_after_the_chunk_read(): void
    {
        $rows = [];
        foreach (['metadata', 'currency'] as $kind) {
            $mirror = BookingMirror::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'reservation_id' => 'MIG-' . $kind, 'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut]);
            \Illuminate\Support\Facades\DB::table('booking_mirror')->where('id', $mirror->id)->update(['raw_json' => json_encode(['old' => true])]);
            $rows[$kind] = $mirror->id;
        }
        $interleaved = false;
        \Illuminate\Support\Facades\DB::listen(function ($query) use (&$interleaved, $rows) {
            if ($interleaved || !str_contains($query->sql, 'booking_mirror') || !str_contains($query->sql, 'limit 250')) return;
            $interleaved = true;
            // An old application's provider update commits between the chunk read and the migration's row update.
            \Illuminate\Support\Facades\DB::table('booking_mirror')->where('id', $rows['metadata'])->update(['raw_json' => json_encode(['old' => true, 'provider_update' => 'new'])]);
            \Illuminate\Support\Facades\DB::table('booking_mirror')->where('id', $rows['currency'])->update(['raw_json' => json_encode(['currency' => 'GBP', '_currency_source' => 'quoted_snapshot'])]);
        });
        (require database_path('migrations/2026_10_29_140100_snapshot_stay_currency.php'))->up();
        $this->assertTrue($interleaved);
        $metadata = json_decode(\Illuminate\Support\Facades\DB::table('booking_mirror')->where('id', $rows['metadata'])->value('raw_json'), true);
        $this->assertSame('new', $metadata['provider_update'] ?? null);
        $this->assertSame('EUR', $metadata['currency']);
        $currency = json_decode(\Illuminate\Support\Facades\DB::table('booking_mirror')->where('id', $rows['currency'])->value('raw_json'), true);
        $this->assertSame(['currency' => 'GBP', '_currency_source' => 'quoted_snapshot'], $currency);
    }

    private function guest(): array
    {
        return ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test'];
    }

    /** Quotes room 101 and confirms it; returns [the quote, the Smoobu reservation sent, the confirm response]. */
    private function quoteAndConfirm(): array
    {
        $quote = $this->engine->quote(['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2]);
        $sent = null;
        $this->smoobu->shouldReceive('createReservation')->once()->andReturnUsing(function (array $p) use (&$sent) {
            $sent = $p;
            return ['id' => 556001, 'reference-id' => 'BK-CUR001'];
        });
        $res = $this->engine->confirm(['hold_token' => $quote['hold_token'], 'guest' => $this->guest()]);

        return [$quote, $sent, $res];
    }

    public function test_a_eur_venue_is_held_receipted_and_answered_in_eur_exactly_as_before(): void
    {
        [$quote, $sent, $res] = $this->quoteAndConfirm();

        $this->assertSame('EUR', $quote['currency']);
        $this->assertSame('EUR', BookingHold::query()->where('hold_token', $quote['hold_token'])->sole()->payload_json['currency']);
        $this->assertSame(['EUR'], array_values(array_unique(array_column($sent['priceElements'], 'currencyCode'))));
        $this->assertStringContainsString('Payment: unpaid (€200.00 due)', $sent['assistant-notice']);
        $this->assertStringContainsString('Accommodation: 2 nights × €100.00 = €200.00', $sent['assistant-notice']);
        $this->assertStringContainsString('Total: €200.00', $sent['assistant-notice']);
        $this->assertSame('EUR', $res['currency']);
    }

    public function test_a_usd_venue_is_held_receipted_and_answered_in_usd(): void
    {
        $this->venueCurrency('usd');

        [$quote, $sent, $res] = $this->quoteAndConfirm();

        $this->assertSame('USD', $quote['currency']);
        $this->assertSame('USD', BookingHold::query()->where('hold_token', $quote['hold_token'])->sole()->payload_json['currency']);
        $this->assertSame(['USD'], array_values(array_unique(array_column($sent['priceElements'], 'currencyCode'))));
        $this->assertStringContainsString('Payment: unpaid (USD 200.00 due)', $sent['assistant-notice']);
        $this->assertStringContainsString('Accommodation: 2 nights × USD 100.00 = USD 200.00', $sent['assistant-notice']);
        $this->assertStringContainsString('Total: USD 200.00', $sent['assistant-notice']);
        $this->assertStringNotContainsString('€', $sent['assistant-notice']);
        $this->assertSame('USD', $res['currency']);
        $mirror = BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame(['USD'], BookingPriceElement::withoutGlobalScopes()->where('booking_mirror_id', $mirror->id)->pluck('currency_code')->unique()->values()->all());
    }

    public function test_a_yen_receipt_has_no_decimals(): void
    {
        $this->venueCurrency('JPY');

        [, $sent] = $this->quoteAndConfirm();

        $this->assertStringContainsString('Total: JPY 200', $sent['assistant-notice']);
        $this->assertStringNotContainsString('JPY 200.00', $sent['assistant-notice']);
        $this->assertSame('JPY 12000', BookingEngineService::receiptMoney(12000.0, 'jpy'));
        $this->assertSame('€12.50', BookingEngineService::receiptMoney(12.5, 'EUR'));
    }

    public function test_a_combination_quote_carries_the_venues_currency(): void
    {
        $this->venueCurrency('GBP');

        $quote = $this->engine->quoteCombo(['unit_ids' => ['101', '102'], 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 3]);

        $this->assertSame('GBP', $quote['currency']);
        $this->assertSame('GBP', BookingHold::query()->where('hold_token', $quote['hold_token'])->sole()->payload_json['currency']);
    }

    /** A hold keeps the currency it was quoted in (one quoted before the release says EUR). */
    public function test_a_hold_is_confirmed_in_the_currency_it_was_quoted_in(): void
    {
        $hold = BookingHold::create(['hold_token' => Str::random(48), 'status' => 'active', 'expires_at' => now()->addMinutes(10), 'payload_json' => [
            'unit_id' => '101', 'unit_name' => 'Sea view', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'nights' => 2,
            'adults' => 2, 'children' => 0, 'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 200.0,
            'currency' => 'EUR', 'price_per_night' => 100.0,
        ]]);
        $this->venueCurrency('USD');
        $this->smoobu->shouldReceive('createReservation')->once()->andReturn(['id' => 556002, 'reference-id' => 'BK-CUR002']);

        $res = $this->engine->confirm(['hold_token' => $hold->hold_token, 'guest' => $this->guest()]);

        $this->assertSame('EUR', $res['currency']);
        $mirror = BookingMirror::withoutGlobalScopes()->where('reservation_id', '556002')->firstOrFail();
        $this->assertSame('EUR', $mirror->currency);
        $this->assertSame('quoted_snapshot', $mirror->currency_source);
    }

    /** The replay by payment has no hold to read: it answers the venue's currency. */
    public function test_the_replay_by_payment_answers_the_venues_currency(): void
    {
        $this->venueCurrency('USD');
        BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => '556003', 'booking_reference' => 'BK-CUR003', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200,
            'payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_cur_replay',
        ]);

        $res = $this->engine->confirm(['hold_token' => 'any', 'guest' => $this->guest(), 'payment_intent_id' => 'pi_cur_replay']);

        $this->assertTrue($res['replayed']);
        $this->assertSame('USD', $res['currency']);
    }
}
