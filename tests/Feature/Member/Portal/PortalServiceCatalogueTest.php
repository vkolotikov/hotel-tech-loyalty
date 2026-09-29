<?php

namespace Tests\Feature\Member\Portal;

use App\Models\HotelSetting;
use App\Models\TierBenefit;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalServiceCatalogueTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema, SeedsDiscountFixture;

    private \App\Models\Organization $org;
    private string $token;
    // $member is declared by SeedsDiscountFixture (protected LoyaltyMember $member).

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        if (!\Illuminate\Support\Facades\Schema::hasColumn('tier_benefits', 'applies_to')) \Illuminate\Support\Facades\Schema::table('tier_benefits', fn ($t) => $t->string('applies_to', 12)->default('all'));
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
    }

    private function setting(string $key, string $value): void
    {
        // organization_id is deliberately absent from HotelSetting::$fillable
        // (BelongsToOrganization sets it from the bound tenant on create, to
        // stop request data from escaping the tenant) — mass-assigning it via
        // updateOrCreate()'s $attributes array is silently dropped, so it is
        // set directly on the model instead.
        $row = HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', $key)->first() ?? new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = $key;
        $row->value = $value;
        $row->group = 'booking';
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function tenPercentOnServices(): void
    {
        $def = \App\Models\BenefitDefinition::create(['organization_id' => $this->org->id, 'name' => '10% off treatments', 'code' => 'ten', 'category' => 'discount', 'is_active' => true]);
        TierBenefit::create(['organization_id' => $this->org->id, 'tier_id' => $this->member->tier_id, 'benefit_id' => $def->id, 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services', 'is_active' => true]);
    }

    public function test_the_catalogue_carries_the_member_price(): void
    {
        $this->seedBookableService($this->org->id);
        $this->tenPercentOnServices();
        $res = $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertOk();
        $res->assertJsonPath('services.0.price', 60)->assertJsonPath('services.0.member_price', 54)->assertJsonPath('pricing.automatic.value', 10)->assertJsonPath('rules.slot_step', 15);
    }

    public function test_without_a_benefit_the_member_price_is_the_list_price(): void
    {
        $this->seedBookableService($this->org->id);
        $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertOk()->assertJsonPath('services.0.member_price', 60)->assertJsonPath('pricing.automatic', null);
    }

    public function test_a_venue_with_nothing_bookable_answers_not_bookable(): void
    {
        $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertStatus(404)->assertJsonPath('error', 'not_bookable');
    }

    /** Final review, escalated Minor 6: portal booking needs a membership row; without one the catalogue is not offered. */
    public function test_a_user_without_a_member_row_answers_not_bookable(): void
    {
        $this->seedBookableService($this->org->id);
        \App\Models\LoyaltyMember::withoutGlobalScopes()->whereKey($this->member->id)->delete();
        \App\Models\LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);

        $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertStatus(404)->assertJsonPath('error', 'not_bookable');
    }

    public function test_slots_respect_lead_time_and_the_advance_window(): void
    {
        ['service' => $service] = $this->seedBookableService($this->org->id);
        $this->setting('services_max_advance_days', '7');
        $this->setting('services_lead_minutes', '120');
        $this->travelTo(now()->next('Monday')->setTime(8, 0));

        $today = $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$service->id}&date=" . now()->toDateString())->assertOk();
        $labels = array_column($today->json('slots'), 'time_label');
        $this->assertNotContains('09:00', $labels, 'inside the two-hour lead time');
        $this->assertContains('10:00', $labels);

        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$service->id}&date=" . now()->addDays(8)->toDateString())->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');

        $cal = $this->withToken($this->token)->getJson("/api/v1/member/portal/services/calendar?service_id={$service->id}&start=" . now()->toDateString() . '&end=' . now()->addDays(30)->toDateString())->assertOk();
        $this->assertCount(8, $cal->json('available_dates'), 'today plus seven days, every day scheduled');
    }

    /**
     * Final review, Minor 10: the booking window's "today" is the VENUE's
     * (the `venue.timezone` the bootstrap sends), not the application's. At
     * 11:30 UTC on 5 October it is already 00:30 on 6 October in Auckland:
     * the 5th is yesterday there, and a two-day window runs to the 8th.
     */
    public function test_the_booking_window_counts_days_in_the_venues_time_zone(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->org->id);
        if (!\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'timezone')) \Illuminate\Support\Facades\Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        \Illuminate\Support\Facades\DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Pacific/Auckland']);
        $this->setting('services_max_advance_days', '2');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-05 11:30:00', 'UTC'));
        $q = "service_id={$service->id}";

        $cal = $this->withToken($this->token)->getJson("/api/v1/member/portal/services/calendar?{$q}&start=2026-10-05&end=2026-10-11")->assertOk();
        $this->assertSame(['2026-10-06', '2026-10-07', '2026-10-08'], $cal->json('available_dates'));

        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?{$q}&date=2026-10-05")->assertStatus(422);
        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?{$q}&date=2026-10-08")->assertOk();
        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?{$q}&date=2026-10-09")->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');

        // An appointment's digits are the venue's wall clock, whatever offset the client sends:
        // 10:00 on the 8th in Auckland is inside the window; 10:00 on the 9th is not.
        $body = ['service_id' => $service->id, 'master_id' => $master->id, 'party_size' => 1];
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $body + ['start_at' => '2026-10-08T10:00:00Z'])->assertOk();
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $body + ['start_at' => '2026-10-09T10:00:00Z'])
            ->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');
    }

    /**
     * A venue in $zone whose master works 10:00–18:00 every day. Appointment
     * digits are the venue's wall clock; the portal's slots carry the
     * venue's offset. Set before any request (AppointmentClock memoises the
     * zone for the container's scoped lifetime).
     */
    private function venueIn(string $zone): array
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'timezone')) \Illuminate\Support\Facades\Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        \Illuminate\Support\Facades\DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => $zone]);
        $seed = $this->seedBookableService($this->org->id);
        \Illuminate\Support\Facades\DB::table('service_master_schedules')->where('service_master_id', $seed['master']->id)
            ->update(['start_time' => '10:00:00', 'end_time' => '18:00:00']);
        return $seed;
    }

    private function slots(int $serviceId, string $date): array
    {
        $this->flushHeaders();
        return $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$serviceId}&date={$date}")->assertOk()->json('slots');
    }

    /** The 10:00 slot is labelled 10:00 and starts at 10:00 on the venue's clock — `+03:00` in a Riga summer. */
    public function test_slots_carry_the_venues_offset_and_keep_the_schedulers_labels(): void
    {
        ['service' => $service, 'master' => $master] = $this->venueIn('Europe/Riga');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 08:00:00', 'UTC')); // 11:00 in Riga

        $slots = $this->slots($service->id, '2026-10-02');

        $this->assertSame([
            'start' => '2026-10-02T10:00:00+03:00', 'end' => '2026-10-02T10:45:00+03:00',
            'duration_minutes' => 45, 'time_label' => '10:00', 'masters' => [$master->id],
        ], $slots[0]);
        $this->assertSame('17:15', end($slots)['time_label']);
        $this->assertSame('2026-10-02T17:15:00+03:00', end($slots)['start']);
        $this->assertCount(30, $slots, 'every quarter hour from 10:00 to 17:15');
        foreach ($slots as $slot) {
            $this->assertStringEndsWith('+03:00', $slot['start'], 'never Z, never +00:00');
            $this->assertSame(substr($slot['start'], 11, 5), $slot['time_label'], 'the label and the digits agree');
        }
    }

    /**
     * The lead time is measured on true instants. At 11:00 in Riga
     * with a 60-minute lead, 12:00 is the earliest bookable start. Boundary:
     * a slot EXACTLY at now + lead is offered — the scheduler's own rule
     * (`$cursor->lt($earliest)` skips) and the quote's `too_soon` rule
     * (`$start->lessThan(now + lead)`) are both inclusive, and the UTC test
     * above (08:00 + 120 min offers 10:00) pins it.
     */
    public function test_the_lead_time_is_measured_on_the_venues_clock(): void
    {
        ['service' => $service] = $this->venueIn('Europe/Riga');
        $this->setting('services_lead_minutes', '60');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 08:00:00', 'UTC')); // 11:00 in Riga

        $labels = array_column($this->slots($service->id, '2026-10-01'), 'time_label');

        foreach (['10:00', '11:00', '11:45'] as $gone) {
            $this->assertNotContains($gone, $labels, "{$gone} Riga is before 12:00 Riga");
        }
        $this->assertSame('12:00', $labels[0], 'exactly now + lead is offered');
        $this->assertContains('13:00', $labels);
    }

    /**
     * West of UTC the digits read as UTC are EARLIER than the true
     * instant, so the scheduler's own lead filter would hide bookable slots.
     * The portal asks the scheduler with its lead switched off and filters on
     * true instants itself. 12:00 UTC is 08:00 in New York (EDT, -04:00).
     */
    public function test_west_of_utc_the_morning_is_still_offered(): void
    {
        ['service' => $service] = $this->venueIn('America/New_York');
        $this->setting('services_lead_minutes', '60');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 12:00:00', 'UTC')); // 08:00 in New York

        $slots = $this->slots($service->id, '2026-10-01');

        $this->assertSame('10:00', $slots[0]['time_label']);
        $this->assertSame('2026-10-01T10:00:00-04:00', $slots[0]['start']);
    }

    /** Riga's clocks skip 03:00–03:59 on Sunday 29 March 2026; no slot is offered at a time that never happens. */
    public function test_a_slot_in_the_hour_a_clock_change_skips_is_not_offered(): void
    {
        ['service' => $service, 'master' => $master] = $this->venueIn('Europe/Riga');
        \Illuminate\Support\Facades\DB::table('service_master_schedules')->where('service_master_id', $master->id)->where('day_of_week', 0)
            ->update(['start_time' => '01:00:00', 'end_time' => '06:00:00']);
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-03-25 10:00:00', 'UTC'));

        $slots = $this->slots($service->id, '2026-03-29');
        $labels = array_column($slots, 'time_label');

        foreach (['03:00', '03:15', '03:30', '03:45'] as $never) {
            $this->assertNotContains($never, $labels);
        }
        $this->assertContains('02:45', $labels);
        $this->assertSame('2026-03-29T02:45:00+02:00', $slots[array_search('02:45', $labels, true)]['start']);
        $this->assertSame('2026-03-29T04:00:00+03:00', $slots[array_search('04:00', $labels, true)]['start']);
    }

    public function test_another_venues_service_is_not_found(): void
    {
        $other = $this->tenant('Other');
        ['service' => $foreign] = $this->seedBookableService($other->id);
        $this->seedBookableService($this->org->id);
        $this->withToken($this->token)->getJson("/api/v1/member/portal/services/availability?service_id={$foreign->id}&date=" . now()->toDateString())->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    /**
     * ServiceExtra::$casts['price'] is 'decimal:2', which Eloquent serializes
     * as a STRING ("12.00") — ServiceCatalogue::build() selects that raw
     * column, so the portal endpoint has to re-cast it to a number itself
     * (Service::$price and every quote-line price already get this
     * treatment; extras.price did not, until this test's fix).
     */
    public function test_extras_carry_numeric_prices(): void
    {
        $this->seedBookableService($this->org->id);
        \App\Models\ServiceExtra::create(['organization_id' => $this->org->id, 'name' => 'Hot towel', 'price' => 12, 'price_type' => 'per_person', 'is_active' => true]);

        $res = $this->withToken($this->token)->getJson('/api/v1/member/portal/services')->assertOk();
        $this->assertIsNotString($res->json('extras.0.price'));
        $this->assertEquals(12, $res->json('extras.0.price'));
    }

    /**
     * The public widget reads the same ServiceCatalogue::build() and is
     * deliberately left untouched by the fix above — it has sent the
     * decimal-cast STRING form of an extra's price since before this
     * branch, and this pins that so a future change to the shared catalogue
     * builder can't silently flip it without a test noticing.
     */
    public function test_the_public_widget_still_sends_the_extras_price_as_a_string(): void
    {
        $this->org->update(['widget_token' => 'wt-extras-price-test']);
        $this->seedBookableService($this->org->id);
        \App\Models\ServiceExtra::create(['organization_id' => $this->org->id, 'name' => 'Hot towel', 'price' => 12, 'price_type' => 'per_person', 'is_active' => true]);

        $res = $this->getJson('/api/v1/services/config?org=wt-extras-price-test')->assertOk();
        $this->assertSame('12.00', $res->json('extras.0.price'));
    }
}
