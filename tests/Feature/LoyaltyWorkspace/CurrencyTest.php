<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceExtra;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * The venue's currency in Card & app (release 4, R4-5): a manager's; the list is the server's; a save writes the very
 * setting the appointments Setup writes (BookingRules::write: organizations.currency, services_currency, and the
 * services' and extras' labels), so the bootstrap's venue.currency shows the new one; a dry run says what the change
 * means first — the labels, online payments set up in another currency, bookings kept in another, stays priced apart.
 */
class CurrencyTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, SetsUpServiceBookingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpServiceBookingSchema();
        $this->org->forceFill(['currency' => 'EUR'])->save();
    }

    private function service(string $currency): Service
    {
        return Service::create(['name' => 'Facial ' . uniqid(), 'duration_minutes' => 60, 'price' => 80, 'currency' => $currency]);
    }

    private function booking(Service $service, string $currency, string $start, string $status = 'confirmed'): ServiceBooking
    {
        return ServiceBooking::create([
            'service_id' => $service->id, 'customer_name' => 'Ada', 'customer_email' => 'ada@example.test', 'start_at' => $start,
            'end_at' => $start, 'duration_minutes' => 60, 'total_amount' => 80, 'currency' => $currency, 'status' => $status,
        ]);
    }

    private function stripeIn(string $currency): void
    {
        $this->mock(StripeService::class, function ($mock) use ($currency) {
            $mock->shouldReceive('isEnabled')->andReturn(true);
            $mock->shouldReceive('currency')->andReturn(strtolower($currency));
        });
    }

    public function test_only_a_manager_reads_or_changes_it(): void
    {
        $this->asStaffMember()->getJson($this->api('currency?brand_id=all'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->putJson($this->api('currency?brand_id=all'), ['currency' => 'GBP'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->assertSame('EUR', $this->org->fresh()->currency);
    }

    public function test_it_reads_the_venues_currency_and_the_servers_list_with_the_venues_own_code_in_it(): void
    {
        $response = $this->asManager()->getJson($this->api('currency?brand_id=all'))->assertOk()->assertJsonPath('currency', 'EUR');
        $this->assertContains('GBP', $response->json('options'));
        $this->assertSame(array_values(array_unique($response->json('options'))), $response->json('options'));

        $this->org->forceFill(['currency' => 'KZT'])->save();
        $options = $this->asManager()->getJson($this->api('currency?brand_id=all'))->assertJsonPath('currency', 'KZT')->json('options');
        $this->assertSame('KZT', end($options));
    }

    public function test_a_code_off_the_list_is_refused_on_the_field_and_a_lower_case_one_is_read_as_upper(): void
    {
        foreach (['XYZ', 'euro', '', 'G B'] as $code) {
            $this->asManager()->putJson($this->api('currency?brand_id=all'), ['currency' => $code])->assertStatus(422)->assertJsonValidationErrors(['currency']);
        }
        $this->asManager()->putJson($this->api('currency?brand_id=all'), ['currency' => ' gbp '])->assertOk()->assertJsonPath('currency', 'GBP');
    }

    public function test_a_save_writes_the_setting_booking_setup_writes_and_the_bootstrap_then_shows_it(): void
    {
        $facial = $this->service('EUR');
        $extra = ServiceExtra::create(['name' => 'Mask', 'price' => 10, 'currency' => 'EUR']);
        $kept = $this->booking($facial, 'EUR', '2026-10-20 10:00:00');

        $this->asManager()->putJson($this->api('currency?brand_id=all'), ['currency' => 'GBP'])->assertOk()
            ->assertJsonPath('currency', 'GBP');

        $this->assertSame('GBP', $this->org->fresh()->currency);
        $this->assertSame('GBP', HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', 'services_currency')->value('value'));
        $this->assertSame('GBP', $facial->fresh()->currency);
        $this->assertSame('GBP', $extra->fresh()->currency);
        // A price is relabelled, never converted; a booking keeps the currency it was made in.
        $this->assertSame('80.00', (string) $facial->fresh()->price);
        $this->assertSame('EUR', $kept->fresh()->currency);
        $this->asManager()->getJson($this->api('bootstrap?brand_id=all'))->assertJsonPath('venue.currency', 'GBP');

        $audit = AuditLog::where('action', 'loyalty.currency_changed')->firstOrFail();
        $this->assertSame(['currency' => 'GBP'], $audit->new_values);
        $this->assertSame(['currency' => 'EUR'], $audit->old_values);
    }

    public function test_a_dry_run_changes_nothing_and_says_what_the_change_means(): void
    {
        $this->stripeIn('EUR');
        $facial = $this->service('EUR');
        $this->service('GBP');
        ServiceExtra::create(['name' => 'Mask', 'price' => 10, 'currency' => 'EUR']);
        $this->booking($facial, 'EUR', '2026-10-20 10:00:00');                  // ahead
        $this->booking($facial, 'EUR', '2026-09-20 10:00:00', 'completed');     // done
        $this->booking($facial, 'GBP', '2026-10-21 10:00:00');                  // already in the new currency
        DB::table('booking_mirror')->insert(['organization_id' => $this->org->id, 'reservation_id' => 'R1', 'price_total' => 300, 'created_at' => now(), 'updated_at' => now()]);
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'booking_currency', 'value' => 'EUR', 'type' => 'string', 'group' => 'booking']);

        $this->asManager()->putJson($this->api('currency?brand_id=all'), ['currency' => 'GBP', 'dry_run' => true])->assertOk()
            ->assertExactJson([
                'dry_run'  => true,
                'from'     => 'EUR',
                'to'       => 'GBP',
                'relabel'  => ['services' => 1, 'extras' => 1],
                'payments' => ['mismatch' => true, 'currency' => 'EUR'],
                'bookings' => ['total' => 2, 'upcoming' => 1],
                'stays'    => ['currency' => 'EUR'],
            ]);
        $this->assertSame('EUR', $this->org->fresh()->currency);
        $this->assertSame('EUR', $facial->fresh()->currency);
        $this->assertSame(0, AuditLog::where('action', 'loyalty.currency_changed')->count());

        // Back to the currency Stripe takes: nothing to warn about payments; no stays apart.
        $this->asManager()->putJson($this->api('currency?brand_id=all'), ['currency' => 'EUR', 'dry_run' => true])
            ->assertJsonPath('payments', ['mismatch' => false, 'currency' => null])
            ->assertJsonPath('stays', null)
            ->assertJsonPath('bookings', ['total' => 1, 'upcoming' => 1]);
    }

    public function test_without_online_payments_or_stays_there_is_nothing_to_warn_about(): void
    {
        $this->asManager()->putJson($this->api('currency?brand_id=all'), ['currency' => 'CHF', 'dry_run' => true])->assertOk()
            ->assertJsonPath('payments', ['mismatch' => false, 'currency' => null])
            ->assertJsonPath('bookings', ['total' => 0, 'upcoming' => 0])
            ->assertJsonPath('stays', null);
    }
}
