<?php

namespace Tests\Feature\Appointments\Setup;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceExtra;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\BookingRules;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class BookingRulesTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_the_defaults_read_as_the_widget_reads_them(): void
    {
        $this->org->forceFill(['widget_token' => 'tok-lumiere'])->save();
        $rules = BookingRules::read($this->org->fresh());

        $this->assertSame('UTC', $rules['timezone']);
        $this->assertFalse($rules['timezone_named']);
        $this->assertSame('EUR', $rules['currency']);
        $this->assertSame([60, 15, 60, true, true], [$rules['lead_minutes'], $rules['slot_step'], $rules['max_advance_days'], $rules['allow_master_choice'], $rules['points_on_bookings']]);
        $this->assertStringEndsWith('/services/tok-lumiere', $rules['booking_link']);
        $this->assertStringContainsString('data-org="tok-lumiere"', $rules['embed_snippet']);
        $this->assertContains('Europe/Riga', $rules['zones']);
        $this->assertNotContains('UTC', $rules['zones']);
    }

    public function test_writing_stores_every_setting_where_the_widget_and_the_portal_read_it(): void
    {
        (new BookingRules())->write($this->org, [
            'timezone' => 'Europe/Riga', 'lead_minutes' => 120, 'slot_step' => 30, 'max_advance_days' => 90,
            'allow_master_choice' => false, 'points_on_bookings' => false,
        ]);
        app()->forgetScopedInstances();

        $this->assertSame('Europe/Riga', VenueClock::zone($this->org->id));
        foreach (['services_lead_minutes' => '120', 'services_slot_step' => '30', 'services_max_advance_days' => '90', 'services_allow_master_choice' => 'false', 'points_on_bookings' => 'false'] as $key => $value) {
            $this->assertSame($value, HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->value('value'), $key);
        }
        $rules = BookingRules::read($this->org->fresh());
        $this->assertSame([120, 30, 90, false, false], [$rules['lead_minutes'], $rules['slot_step'], $rules['max_advance_days'], $rules['allow_master_choice'], $rules['points_on_bookings']]);
    }

    public function test_a_currency_change_relabels_services_and_extras_and_never_converts(): void
    {
        ServiceExtra::create(['name' => 'Hot stones', 'price' => 10, 'currency' => 'EUR', 'is_active' => true]);
        $this->assertSame(['services' => 1, 'extras' => 1], BookingRules::currencyImpact($this->org->id, 'GBP'));

        (new BookingRules())->write($this->org, ['currency' => 'GBP']);

        $this->assertSame('GBP', $this->org->fresh()->currency);
        $this->assertSame('GBP', BookingRules::currency());
        $this->assertSame(['GBP', '60.00'], [Service::find($this->service->id)->currency, (string) Service::find($this->service->id)->price]);
        $this->assertSame('GBP', ServiceExtra::first()->currency);
        $this->assertSame(['services' => 0, 'extras' => 0], BookingRules::currencyImpact($this->org->id, 'GBP'));
    }

    public function test_the_venue_currency_is_the_one_its_services_are_priced_in(): void
    {
        // A registration default nobody chose (organizations.currency is written by no screen) must not
        // price new services in another currency than every price the venue already has.
        $this->org->forceFill(['currency' => 'USD'])->save();

        $this->assertSame('EUR', BookingRules::currency());
        $this->assertSame('EUR', BookingRules::read($this->org->fresh())['currency']);

        Service::query()->delete();
        $this->assertSame('USD', BookingRules::currency()); // no service yet: the organisation's own
    }

    public function test_the_link_copied_mark_is_a_setting(): void
    {
        BookingRules::markLinkCopied($this->org->id);

        $this->assertNotNull(HotelSetting::getValue(BookingRules::LINK_COPIED));
    }
}
