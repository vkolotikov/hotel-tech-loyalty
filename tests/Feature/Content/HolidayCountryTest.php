<?php

namespace Tests\Feature\Content;

use App\Services\Content\Days\HolidayCountry;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The brand's holiday country (spec 2026-10-16 §3.3): its choice, else a guess from the organisation's country or the venue's zone. */
class HolidayCountryTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function venue(?string $country, ?string $zone): void
    {
        $this->org->forceFill(['country' => $country, 'timezone' => $zone])->save();
        // VenueClock memoises the zone per request.
        app()->forgetScopedInstances();
    }

    public function test_the_guess_takes_the_organisations_country_then_the_venues_zone(): void
    {
        $this->venue('ie', 'Europe/Riga');
        $this->assertSame('IE', HolidayCountry::guess($this->org->fresh()));
        $this->venue('UK', null);
        $this->assertSame('GB', HolidayCountry::guess($this->org->fresh()));
        $this->venue('RU', 'Europe/Riga');
        $this->assertSame('LV', HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'America/Indiana/Indianapolis');
        $this->assertSame('US', HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'Pacific/Honolulu');
        $this->assertSame('US', HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'UTC');
        $this->assertNull(HolidayCountry::guess($this->org->fresh()));
        $this->venue(null, 'Asia/Tokyo');
        $this->assertNull(HolidayCountry::guess($this->org->fresh()));
    }

    public function test_the_brands_choice_wins_and_none_means_no_holidays(): void
    {
        $this->venue(null, 'Europe/London');
        $this->assertSame('GB', HolidayCountry::for($this->org->fresh(), $this->profile->fresh()));
        $this->profile->forceFill(['holiday_country' => 'FR'])->save();
        $this->assertSame('FR', HolidayCountry::for($this->org->fresh(), $this->profile->fresh()));
        $this->profile->forceFill(['holiday_country' => 'none'])->save();
        $this->assertNull(HolidayCountry::for($this->org->fresh(), $this->profile->fresh()));
        $this->assertSame('GB', HolidayCountry::for($this->org->fresh(), null));
    }

    public function test_a_manager_chooses_the_country_and_the_switch_and_everyone_reads_them(): void
    {
        $this->venue(null, 'Europe/Berlin');
        $this->asStaffMember()->getJson($this->api('brand'))->assertOk()
            ->assertJsonPath('profile.holiday_country', null)
            ->assertJsonPath('profile.marketing_days', true)
            ->assertJsonPath('holiday_country_guess', 'DE');

        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => 'ES', 'marketing_days' => false])->assertOk()
            ->assertJsonPath('profile.holiday_country', 'ES')
            ->assertJsonPath('profile.marketing_days', false);
        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => 'none'])->assertOk()->assertJsonPath('profile.holiday_country', 'none');
        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => null])->assertOk()->assertJsonPath('profile.holiday_country', null);
        $this->asManager()->putJson($this->api('brand/profile'), ['holiday_country' => 'RU'])->assertStatus(422)->assertJsonValidationErrors('holiday_country');
        $this->asManager()->putJson($this->api('brand/profile'), ['marketing_days' => 'often'])->assertStatus(422)->assertJsonValidationErrors('marketing_days');
        $this->asStaffMember()->putJson($this->api('brand/profile'), ['holiday_country' => 'GB'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
    }

    public function test_a_brand_without_a_profile_still_carries_the_guess(): void
    {
        $this->venue('EE', null);
        [$second] = $this->secondBrand(false);

        $this->asManager()->getJson($this->api("brand?brand_id={$second}"))->assertOk()
            ->assertJsonPath('profile', null)
            ->assertJsonPath('holiday_country_guess', 'EE');
    }

    // Owner ruling (Plan 4A-2): the zone's own country among the nine; a legacy zone name stands for its country.
    public function test_any_zone_of_the_nine_countries_and_its_legacy_names_guess_their_country(): void
    {
        $zones = [
            'America/Boise' => 'US', 'America/Juneau' => 'US', 'America/North_Dakota/Center' => 'US', 'US/Eastern' => 'US',
            'Atlantic/Canary' => 'ES', 'Europe/Busingen' => 'DE', 'Eire' => 'IE', 'GB' => 'GB', 'America/Toronto' => null,
        ];
        foreach ($zones as $zone => $country) {
            $this->venue(null, $zone);
            $this->assertSame($country, HolidayCountry::guess($this->org->fresh()), $zone);
        }
    }
}
