<?php

namespace Tests\Feature\Dashboard;

use App\Services\Dashboard\VenuePulse;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The dashboards' clock, place and weather (2026-11-09): the venue's zone and day, the city of its first location (or
 * of its zone), Open-Meteo's weather in the venue's wall clock — and nothing breaks when the weather is not known.
 * The clock is the CRM suite's: Wednesday 4 November 2026, 10:00 UTC, 12:00 in Riga.
 */
class VenuePulseTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
        if (!Schema::hasTable('properties')) {
            Schema::create('properties', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->string('city', 100)->nullable();
                $t->string('country', 100)->nullable();
                $t->string('timezone', 64)->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasColumn('organizations', 'country')) {
            Schema::table('organizations', fn (Blueprint $t) => $t->string('country', 2)->nullable());
        }
        DB::table('organizations')->where('id', $this->org->id)->update(['country' => 'LV']);
        $this->org->refresh();
        config(['services.weather.enabled' => true]);
    }

    private function fakeProvider(): void
    {
        Http::fake([
            'geocoding-api.open-meteo.com/*' => Http::response(['results' => [['name' => 'Jūrmala', 'latitude' => 56.968, 'longitude' => 23.7704, 'country_code' => 'LV']]]),
            'api.open-meteo.com/*' => Http::response([
                'current' => ['temperature_2m' => 6.4, 'apparent_temperature' => 3.1, 'weather_code' => 61, 'is_day' => 1, 'wind_speed_10m' => 14.2, 'relative_humidity_2m' => 87],
                'hourly' => [
                    'time' => ['2026-11-04T10:00', '2026-11-04T11:00', '2026-11-04T12:00', '2026-11-04T13:00'],
                    'temperature_2m' => [5.0, 5.8, 6.4, 6.9],
                    'weather_code' => [3, 3, 61, 61],
                    'precipitation_probability' => [10, 20, 60, 70],
                    'is_day' => [1, 1, 1, 1],
                ],
                'daily' => [
                    'time' => ['2026-11-04', '2026-11-05', '2026-11-06'],
                    'weather_code' => [61, 3, 0],
                    'temperature_2m_max' => [7.2, 6.0, 4.1],
                    'temperature_2m_min' => [2.1, 1.0, -1.5],
                    'sunrise' => ['2026-11-04T07:46', '2026-11-05T07:48', '2026-11-06T07:50'],
                    'sunset' => ['2026-11-04T16:23', '2026-11-05T16:21', '2026-11-06T16:19'],
                    'precipitation_probability_max' => [80, 20, 0],
                ],
            ]),
        ]);
    }

    public function test_the_venues_clock_and_the_weather_of_its_first_location(): void
    {
        $this->fakeProvider();
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Seaside', 'code' => 'SEA', 'city' => 'Jūrmala', 'country' => 'Latvia', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asStaffMember()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('timezone', 'Europe/Riga')
            ->assertJsonPath('today', '2026-11-04')
            ->assertJsonPath('now', '2026-11-04T12:00:00+02:00')
            ->assertJsonPath('currency', \App\Services\Portal\PortalBootstrap::currency($this->org))
            ->assertJsonPath('place.name', 'Jūrmala')
            ->assertJsonPath('place.source', 'location')
            // "Latvia" reads as LV.
            ->assertJsonPath('place.country', 'LV')
            ->assertJsonPath('weather_status', 'ok')
            ->assertJsonPath('weather.current.temp', 6.4)
            ->assertJsonPath('weather.current.code', 61)
            ->assertJsonPath('weather.current.is_day', true)
            ->assertJsonPath('weather.today.max', 7.2)
            ->assertJsonPath('weather.today.sunset', '2026-11-04T16:23')
            // From the venue's current hour (12:00 in Riga), never the hours already gone.
            ->assertJsonPath('weather.hours.0.time', '2026-11-04T12:00')
            ->assertJsonCount(2, 'weather.hours')
            ->assertJsonPath('weather.days.0.date', '2026-11-05')
            ->assertJsonCount(2, 'weather.days')
            ->assertJsonPath('weather.units.temp', 'C');

        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'geocoding-api') && $r['name'] === 'Jūrmala' && $r['countryCode'] === 'LV');
        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'api.open-meteo.com/v1/forecast') && $r['timezone'] === 'Europe/Riga' && $r['temperature_unit'] === 'celsius');
    }

    public function test_without_a_location_the_zones_city_and_both_answers_are_kept(): void
    {
        $this->fakeProvider();

        $this->asManager()->getJson($this->adminApi('dashboard/pulse'))->assertOk()
            ->assertJsonPath('place.name', 'Riga')
            ->assertJsonPath('place.source', 'timezone')
            ->assertJsonPath('weather.current.temp', 6.4);
        $this->asManager()->getJson($this->adminApi('dashboard/pulse'))->assertOk()
            ->assertJsonPath('weather.current.temp', 6.4);

        // One geocoding and one forecast request for both pages: the second is the cache's.
        Http::assertSentCount(2);
    }

    public function test_a_provider_that_fails_leaves_the_clock_and_is_not_asked_again_at_once(): void
    {
        Http::fake(['*' => Http::response('down', 503)]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('today', '2026-11-04')
            ->assertJsonPath('place.name', 'Riga')
            ->assertJsonPath('weather', null);
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()->assertJsonPath('weather', null);

        Http::assertSentCount(1);
    }

    public function test_switched_off_or_no_named_zone_means_no_weather_and_no_request(): void
    {
        Http::fake();
        config(['services.weather.enabled' => false]);
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('place.name', 'Riga')
            ->assertJsonPath('weather', null);

        config(['services.weather.enabled' => true]);
        $this->org->forceFill(['timezone' => 'UTC'])->save();
        app()->forgetScopedInstances();
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('timezone', 'UTC')
            ->assertJsonPath('place', null)
            ->assertJsonPath('weather', null);

        Http::assertNothingSent();
    }

    public function test_an_american_venue_reads_fahrenheit(): void
    {
        $this->fakeProvider();
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Downtown', 'code' => 'DT', 'city' => 'Boston', 'country' => 'US', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('place.country', 'US')
            ->assertJsonPath('weather.units.temp', 'F')
            ->assertJsonPath('weather.units.wind', 'mph');

        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'forecast') && $r['temperature_unit'] === 'fahrenheit' && $r['wind_speed_unit'] === 'mph');
    }

    public function test_another_organisations_location_is_never_used(): void
    {
        $this->fakeProvider();
        $other = \App\Models\Organization::create(['name' => 'Elsewhere', 'slug' => 'org-' . uniqid('', true), 'timezone' => 'Europe/Riga']);
        DB::table('properties')->insert(['organization_id' => $other->id, 'name' => 'Theirs', 'code' => 'TH', 'city' => 'Tallinn', 'country' => 'EE', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('place.name', 'Riga')
            ->assertJsonPath('place.source', 'timezone');
    }

    public function test_a_zone_names_its_city(): void
    {
        $this->assertSame('Riga', VenuePulse::cityOfZone('Europe/Riga'));
        $this->assertSame('Buenos Aires', VenuePulse::cityOfZone('America/Argentina/Buenos_Aires'));
        $this->assertNull(VenuePulse::cityOfZone('UTC'));
        $this->assertNull(VenuePulse::cityOfZone('Etc/GMT+2'));
        $this->assertSame('LV', VenuePulse::countryCode(' lv '));
        $this->assertSame('GB', VenuePulse::countryCode('UK'));
    }

    public function test_a_country_reads_from_its_name_in_the_venues_languages(): void
    {
        foreach (['Latvia', 'latvia', 'Lettland', 'Lettonie', 'Letonia', 'Латвия', 'Latvija'] as $name) {
            $this->assertSame('LV', VenuePulse::countryCode($name), $name);
        }
        $this->assertSame('GB', VenuePulse::countryCode('United Kingdom'));
        $this->assertSame('GB', VenuePulse::countryCode('England'));
        $this->assertSame('US', VenuePulse::countryCode('U.S.A.'));
        $this->assertSame('CI', VenuePulse::countryCode('Côte d’Ivoire'));
        $this->assertNull(VenuePulse::countryCode('Narnia'));
        $this->assertNull(VenuePulse::countryCode(''));
    }

    /**
     * The owner's case (9 Nov): an organisation registered in another country than its location ("Riga", "Latvia" for a
     * company in GB). The organisation's country is never put in the location's place.
     */
    public function test_a_location_abroad_is_looked_up_in_its_own_country(): void
    {
        $this->fakeProvider();
        DB::table('organizations')->where('id', $this->org->id)->update(['country' => 'GB']);
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Old Town', 'code' => 'OT', 'city' => 'Riga', 'country' => 'Latvia', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('place.country', 'LV')
            ->assertJsonPath('weather_status', 'ok');

        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'geocoding-api') && $r['countryCode'] === 'LV');
        Http::assertNotSent(fn (ClientRequest $r) => str_contains($r->url(), 'geocoding-api') && ($r['countryCode'] ?? null) === 'GB');
    }

    public function test_a_city_not_found_in_its_country_is_looked_up_without_it(): void
    {
        Http::fake(function (ClientRequest $r) {
            if (str_contains($r->url(), 'geocoding-api')) {
                return isset($r['countryCode'])
                    ? Http::response(['generationtime_ms' => 0.3])
                    : Http::response(['results' => [['name' => 'Jūrmala', 'latitude' => 56.968, 'longitude' => 23.7704, 'country_code' => 'LV', 'timezone' => 'Europe/Riga']]]);
            }

            return Http::response(['current' => ['temperature_2m' => 4.0, 'weather_code' => 0, 'is_day' => 1]]);
        });
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Seaside', 'code' => 'SEA', 'city' => 'Jūrmala', 'country' => 'EE', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('weather_status', 'ok')
            ->assertJsonPath('weather.current.temp', 4);
    }

    public function test_a_city_nobody_knows_says_so_and_is_asked_again_within_the_hour_only_once(): void
    {
        Http::fake(fn (ClientRequest $r) => str_contains($r->url(), 'geocoding-api') ? Http::response(['generationtime_ms' => 0.3]) : Http::response([], 500));
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Typo', 'code' => 'TY', 'city' => 'Rigga', 'country' => 'LV', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('place.name', 'Rigga')
            ->assertJsonPath('weather', null)
            ->assertJsonPath('weather_status', 'place_not_found');
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()->assertJsonPath('weather_status', 'place_not_found');
        // With the country, then without it — once: the second page reads the remembered miss.
        Http::assertSentCount(2);

        // An hour later it is asked again (the location may have been corrected).
        $this->travel(61)->minutes();
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk();
        Http::assertSentCount(4);
    }

    public function test_a_provider_that_cannot_be_reached_is_unavailable_not_unknown(): void
    {
        Http::fake(['*' => Http::response('down', 503)]);
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Old Town', 'code' => 'OT', 'city' => 'Riga', 'country' => 'LV', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()->assertJsonPath('weather_status', 'unavailable');
    }

    public function test_a_venue_on_utc_reads_the_clock_of_its_place(): void
    {
        $this->fakeProvider();
        $this->org->forceFill(['timezone' => 'UTC'])->save();
        app()->forgetScopedInstances();
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Old Town', 'code' => 'OT', 'city' => 'Riga', 'country' => 'Latvia', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        // The location names no zone: the city search's (the fake answers without one) leaves UTC…
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('timezone', 'UTC')
            ->assertJsonPath('timezone_source', 'venue');

        // …the location's own zone is the clock's.
        DB::table('properties')->where('organization_id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('timezone', 'Europe/Riga')
            ->assertJsonPath('timezone_source', 'location')
            ->assertJsonPath('now', '2026-11-04T12:00:00+02:00');
    }

    public function test_the_place_found_names_the_clock_when_the_location_does_not(): void
    {
        Http::fake([
            'geocoding-api.open-meteo.com/*' => Http::response(['results' => [['name' => 'Riga', 'latitude' => 56.946, 'longitude' => 24.1059, 'country_code' => 'LV', 'timezone' => 'Europe/Riga']]]),
            'api.open-meteo.com/*' => Http::response(['current' => ['temperature_2m' => 5.0, 'weather_code' => 3, 'is_day' => 1]]),
        ]);
        $this->org->forceFill(['timezone' => 'UTC'])->save();
        app()->forgetScopedInstances();
        DB::table('properties')->insert(['organization_id' => $this->org->id, 'name' => 'Old Town', 'code' => 'OT', 'city' => 'Riga', 'country' => 'LV', 'timezone' => 'UTC', 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);

        $this->asManager()->getJson($this->crmApi('pulse'))->assertOk()
            ->assertJsonPath('timezone', 'Europe/Riga')
            ->assertJsonPath('timezone_source', 'place');

        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'forecast') && $r['timezone'] === 'Europe/Riga');
    }

    public function test_the_locations_city_search(): void
    {
        Http::fake(['geocoding-api.open-meteo.com/*' => Http::response(['results' => [
            ['name' => 'Riga', 'admin1' => 'Rīga', 'country' => 'Latvia', 'country_code' => 'LV', 'latitude' => 56.946, 'longitude' => 24.10589, 'timezone' => 'Europe/Riga'],
            ['name' => 'Riga', 'admin1' => 'New York', 'country' => 'United States', 'country_code' => 'US', 'latitude' => 43.0, 'longitude' => -77.9, 'timezone' => 'America/New_York'],
            ['name' => 'Broken'],
        ]])]);

        $this->asManager()->getJson($this->adminApi('properties/places?q=Rig&lang=en'))->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonCount(2, 'places')
            ->assertJsonPath('places.0.name', 'Riga')
            ->assertJsonPath('places.0.region', 'Rīga')
            ->assertJsonPath('places.0.country', 'Latvia')
            ->assertJsonPath('places.0.country_code', 'LV')
            ->assertJsonPath('places.0.timezone', 'Europe/Riga')
            ->assertJsonPath('places.1.country_code', 'US');
        Http::assertSent(fn (ClientRequest $r) => $r['name'] === 'Rig' && (int) $r['count'] === 8);

        $this->asManager()->getJson($this->adminApi('properties/places?q=R'))->assertOk()->assertJsonCount(0, 'places');
        $this->asManager()->getJson($this->adminApi('properties/places'))->assertStatus(422);
    }

    public function test_the_city_search_says_when_the_provider_cannot_be_reached(): void
    {
        Http::fake(['*' => Http::response('down', 503)]);
        $this->asManager()->getJson($this->adminApi('properties/places?q=Riga'))->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonCount(0, 'places');
    }

    public function test_an_answer_without_a_current_temperature_is_no_weather(): void
    {
        $this->assertNull(VenuePulse::shape(['current' => ['weather_code' => 3]], CarbonImmutable::parse('2026-11-04 12:00'), false));
    }
}
