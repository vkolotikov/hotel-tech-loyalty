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

        // 10:00 UTC on the 8th is 23:00 on the 8th in Auckland — inside the window; the 9th is not.
        $body = ['service_id' => $service->id, 'master_id' => $master->id, 'party_size' => 1];
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $body + ['start_at' => '2026-10-08T10:00:00Z'])->assertOk();
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/quote', $body + ['start_at' => '2026-10-09T10:00:00Z'])
            ->assertStatus(422)->assertJsonPath('error', 'too_far_ahead');
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
