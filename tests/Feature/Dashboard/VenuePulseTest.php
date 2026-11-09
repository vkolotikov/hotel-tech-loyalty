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
            // "Latvia" is not a code: the organisation's own country stands in.
            ->assertJsonPath('place.country', 'LV')
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
        $this->assertNull(VenuePulse::countryCode('Latvia'));
    }

    public function test_an_answer_without_a_current_temperature_is_no_weather(): void
    {
        $this->assertNull(VenuePulse::shape(['current' => ['weather_code' => 3]], CarbonImmutable::parse('2026-11-04 12:00'), false));
    }
}
