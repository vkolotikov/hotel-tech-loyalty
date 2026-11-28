<?php

namespace Tests\Feature\Content;

use App\Models\HotelSetting;
use App\Services\Booking\Setup\BookingRules;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PlanningSettingsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        config(['services.weather.enabled' => false]);
        CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-11-13 23:30:00', 'UTC'));
    }

    public function test_unset_planning_clock_stays_utc_even_with_a_named_location(): void
    {
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
            'name' => 'Riga', 'code' => 'RIGA', 'city' => 'Riga', 'country' => 'Latvia', 'timezone' => 'Europe/Riga']);
        $this->asManager()->getJson($this->api('bootstrap'))->assertOk()
            ->assertJsonPath('venue.timezone', 'UTC')->assertJsonPath('venue.timezone_named', false)
            ->assertJsonPath('venue.today', '2026-11-13');
        $this->getJson($this->api('pulse'))->assertOk()->assertJsonPath('timezone', 'UTC')
            ->assertJsonPath('timezone_named', false)->assertJsonPath('timezone_source', 'venue')
            ->assertJsonPath('now', '2026-11-13T23:30:00+00:00')->assertJsonPath('today', '2026-11-13')
            ->assertJsonPath('place.name', 'Riga');
        $this->assertDatabaseMissing('hotel_settings', ['organization_id' => $this->org->id, 'key' => 'hotel_timezone']);
    }

    public function test_manager_saves_the_shared_zone_and_pulse_and_bootstrap_agree_across_midnight(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-11-14', 'scheduled_time' => '08:30']);
        $this->asManager()->putJson($this->api('settings'), ['timezone' => 'Europe/Riga'])->assertOk()
            ->assertJsonPath('timezone', 'Europe/Riga')->assertJsonPath('timezone_named', true);
        $this->assertDatabaseHas('hotel_settings', ['organization_id' => $this->org->id, 'key' => 'hotel_timezone', 'value' => 'Europe/Riga']);
        $this->assertSame('2026-11-14', $post->fresh()->scheduled_date->format('Y-m-d'));
        $this->assertSame('08:30', substr($post->fresh()->getRawOriginal('scheduled_time'), 0, 5));
        $this->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('venue.today', '2026-11-14');
        $this->getJson($this->api('pulse'))->assertOk()->assertJsonPath('timezone', 'Europe/Riga')
            ->assertJsonPath('timezone_named', true)->assertJsonPath('today', '2026-11-14')
            ->assertJsonPath('now', '2026-11-14T01:30:00+02:00');
    }

    public function test_unset_clock_keeps_location_weather_useful_in_the_planning_zone(): void
    {
        config(['services.weather.enabled' => true]);
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'brand_id' => $this->brandId,
            'name' => 'Riga', 'code' => 'WEATHER', 'city' => 'Riga', 'country' => 'Latvia', 'timezone' => 'Europe/Riga']);
        Http::preventStrayRequests();
        Http::fake([
            config('services.weather.geocoding_url') . '*' => Http::response(['results' => [
                ['latitude' => 56.95, 'longitude' => 24.1, 'country_code' => 'LV', 'timezone' => 'Europe/Riga'],
            ]]),
            config('services.weather.forecast_url') . '*' => Http::response([
                'current' => ['temperature_2m' => 6.4, 'weather_code' => 3, 'is_day' => 0],
                'hourly' => ['time' => ['2026-11-13T23:00', '2026-11-14T00:00'], 'temperature_2m' => [6.4, 6.2]],
            ]),
        ]);
        $this->asStaffMember()->getJson($this->api('pulse'))->assertOk()->assertJsonPath('timezone', 'UTC')
            ->assertJsonPath('timezone_named', false)->assertJsonPath('weather_status', 'ok')
            ->assertJsonPath('weather.current.temp', 6.4)->assertJsonPath('weather.hours.0.time', '2026-11-13T23:00');
        Http::assertSent(fn ($request) => str_starts_with($request->url(), config('services.weather.forecast_url')) && $request['timezone'] === 'UTC');
    }

    public function test_staff_read_settings_but_cannot_write_and_unsupported_zones_are_refused(): void
    {
        $this->asStaffMember()->getJson($this->api('settings'))->assertOk()
            ->assertJsonPath('timezone', 'UTC')->assertJsonPath('timezone_named', false)
            ->assertJsonStructure(['timezones', 'locations_limit', 'locations_used']);
        $this->putJson($this->api('settings'), ['timezone' => 'Europe/Riga'])->assertForbidden()->assertJsonPath('error', 'manager_only');
        foreach (['UTC', 'EET', '+03:00', 'Bad/Zone'] as $zone) {
            $this->asManager()->putJson($this->api('settings'), ['timezone' => $zone])->assertUnprocessable()->assertJsonValidationErrors('timezone');
        }
        $settings = $this->getJson($this->api('settings'))->assertOk()->json();
        $this->assertContains('Europe/Riga', $settings['timezones']);
        $this->assertSame(BookingRules::zones(), $settings['timezones']);
        HotelSetting::flushCacheFor($this->org->id);
    }
}
