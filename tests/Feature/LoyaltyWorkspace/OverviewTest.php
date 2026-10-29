<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\{AuditLog, BenefitDefinition, BenefitEntitlement, Brand, LoyaltyTier, MemberOffer, PointsTransaction, Reward, RewardRedemption, SpecialOffer, TierAssessment};
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\{DB, Schema};
use Tests\Concerns\LoyaltyWorkspace\{MembershipSchema, TierCountsSchema, ValiditySchema};
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

class OverviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, MembershipSchema, TierCountsSchema, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->buildProgrammeAdviceSchema();
        $this->buildMembershipSchema();
        $this->buildTierCountsSchema();
        $this->buildValiditySchema();
    }

    private function read(string $module, string $params = '')
    {
        return $this->asManager()->getJson($this->api("overview/{$module}" . ($params ? "?{$params}" : '')))->assertOk();
    }

    private function redemption(string $status, string $created, ?string $fulfilled = null): RewardRedemption
    {
        $reward = Reward::create(['name' => 'Coffee', 'points_cost' => 500, 'is_active' => true]);
        $r = RewardRedemption::create(['member_id' => $this->ada->id, 'reward_id' => $reward->id,
            'points_spent' => 500, 'code' => 'R-' . uniqid(), 'status' => $status, 'fulfilled_at' => $fulfilled]);
        $r->forceFill(['created_at' => $created])->save();
        return $r;
    }

    private function benefit(string $status, string $created): BenefitEntitlement
    {
        $b = BenefitDefinition::create(['name' => 'Welcome service', 'code' => uniqid('b'), 'is_active' => true]);
        $r = BenefitEntitlement::create(['member_id' => $this->grace->id, 'benefit_id' => $b->id, 'status' => $status]);
        $r->forceFill(['created_at' => $created, 'fulfilled_at' => $status === 'fulfilled' ? $created : null])->save();
        return $r;
    }

    private function noPoints(): void
    {
        ProgrammeOptions::save($this->org->id, ['points_on_bookings' => false, 'desk_earn_enabled' => false,
            'welcome_bonus_points' => 0, 'birthday_bonus_points' => 0, 'referral_enabled' => false,
            'checkin_enabled' => false, 'checkin_points' => 0, 'stamps_enabled' => false], $this->manager);
    }

    public function test_independent_reads_use_existing_configuration_without_writes(): void
    {
        $before = AuditLog::count();
        $this->read('summary')->assertJsonPath('data.mode', 'points')->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.setup.total', 7)->assertJsonCount(3, 'data.tiers');
        foreach (['checks', 'metrics', 'queue', 'activity'] as $module) {
            $this->read($module)->assertJsonPath('scope', $this->org->id)->assertHeader('Cache-Control', 'no-store, private');
        }
        $this->assertSame($before, AuditLog::count());
        $this->assertSame(1500, $this->ada->fresh()->current_points);
    }

    public function test_current_totals_keep_negative_corrections_but_usage_uses_completion_time(): void
    {
        $this->grace->update(['current_points' => -20, 'joined_at' => '2026-10-01']);
        $this->makeMember('Inactive', 'inactive@example.test', ['is_active' => false, 'current_points' => 9000]);
        $this->redemption('fulfilled', '2026-08-01', '2026-10-01 10:00:00');
        $this->redemption('fulfilled', '2026-09-01', '2026-09-01 10:00:00');
        $this->redemption('pending', '2026-10-01');
        $this->redemption('cancelled', '2026-10-01', '2026-10-01 11:00:00');
        $this->redemption('fulfilled', '2026-10-01', '2026-10-05 10:00:00'); // future
        $this->otherOrganization();
        $r = $this->read('metrics');
        $r->assertJsonPath('data.joined', 1)->assertJsonPath('data.items.0.value', 3)
            ->assertJsonPath('data.items.1.value', 1)->assertJsonPath('data.items.2.value', 1480);
        $this->read('metrics', 'period=90d')->assertJsonPath('data.items.1.value', 2)
            ->assertJsonPath('data.items.0.value', 3)->assertJsonPath('data.items.2.value', 1480);
    }

    public function test_queue_is_complete_oldest_first_stable_and_actionable_and_deep_links_revalidate(): void
    {
        $old = $this->benefit('approved', '2026-08-01');
        $same = $this->redemption('pending', '2026-09-01');
        $sameBenefit = $this->benefit('pending', '2026-09-01');
        for ($i = 0; $i < 30; $i++) $this->benefit('eligible', '2026-10-01');
        $this->benefit('fulfilled', '2026-07-01');
        $this->redemption('cancelled', '2026-07-01');
        $r = $this->read('queue');
        $r->assertJsonPath('data.total', 33)->assertJsonCount(3, 'data.items');
        $this->assertSame([$old->id, $sameBenefit->id, $same->id], array_column($r->json('data.items'), 'id'));
        $this->assertSame($r->json('data.items'), $this->read('queue')->json('data.items'));
        $old->update(['status' => 'fulfilled']);
        $this->asManager()->getJson($this->api('requests?state=approved&request=' . $old->id))->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('requests.0.state', 'fulfilled');
        $same->update(['status' => 'cancelled']);
        $this->asManager()->getJson($this->api('redemptions?request=' . $same->id))->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('redemptions.0.state', 'cancelled');
    }

    public function test_capabilities_and_tenant_boundaries_apply_to_every_read_and_selected_record(): void
    {
        $this->staffMember->staff()->first()->update(['can_redeem_points' => false, 'can_view_analytics' => false]);
        $this->redemption('pending', '2026-10-01');
        $this->benefit('pending', '2026-10-01');
        foreach (['metrics', 'activity'] as $module) $this->asStaffMember()->getJson($this->api("overview/{$module}"))->assertForbidden();
        $this->asStaffMember()->getJson($this->api('overview/queue'))->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.sources', ['benefits']);
        $other = $this->otherOrganization();
        $benefitId = BenefitDefinition::first()->id;
        app()->instance('current_organization_id', $other['org']->id);
        $foreign = BenefitEntitlement::withoutGlobalScopes()->create(['organization_id' => $other['org']->id,
            'member_id' => $other['member']->id, 'benefit_id' => $benefitId, 'status' => 'pending']);
        app()->instance('current_organization_id', $this->org->id);
        $this->read('queue')->assertJsonPath('data.total', 2);
        $this->asManager()->getJson($this->api('requests?request=' . $foreign->id))->assertNotFound();
        $this->asManager()->getJson($this->api('redemptions?request=99999999'))->assertNotFound();
        $this->asManager()->getJson($this->api('overview/metrics?period=invalid'))->assertUnprocessable();
        $this->asManager()->getJson($this->api('overview/unknown'))->assertNotFound();
    }

    public function test_checks_reuse_active_qualification_rules_and_do_not_infer_discount_delivery_from_names(): void
    {
        $this->tiers['platinum']->update(['min_points' => 1000]);
        $r = $this->read('checks');
        $duplicates = array_values(array_filter($r->json('data.issues'), fn ($i) => $i['code'] === 'tiers_share_threshold'));
        $this->assertCount(1, $duplicates);
        $this->assertSame(['Gold', 'Platinum'], array_column($duplicates[0]['entities'], 'name'));
        $this->tiers['platinum']->update(['invitation_only' => true]);
        $this->otherOrganization();
        Reward::create(['name' => '10% off a booking', 'points_cost' => 100, 'is_active' => true]);
        $codes = array_column($this->read('checks')->json('data.issues'), 'code');
        $this->assertNotContains('tiers_share_threshold', $codes);
        $this->assertNotContains('discount_delivery', $codes);
        $this->assertNotContains('wallet', $codes);
    }

    public function test_non_points_modes_use_valid_offers_visits_and_verified_benefit_fulfilment(): void
    {
        $this->noPoints();
        $this->benefit('fulfilled', '2026-10-01');
        $this->benefit('approved', '2026-10-01');
        $this->read('metrics')->assertJsonPath('data.mode', 'services')->assertJsonPath('data.items.1.value', 1);
        ProgrammeOptions::save($this->org->id, ['checkin_enabled' => true], $this->manager);
        foreach ([['2026-10-01', null], ['2026-10-02', '2026-10-03'], ['2026-09-01', null]] as $i => [$day, $reversed]) {
            DB::table('tier_qualification_counts')->insert(['organization_id' => $this->org->id, 'member_id' => $this->ada->id,
                'reference_type' => 'scan', 'reference_id' => $i + 1, 'visits' => 1, 'venue_day' => $day,
                'created_at' => "$day 10:00:00", 'updated_at' => "$day 10:00:00", 'reversed_at' => $reversed]);
        }
        $this->read('metrics')->assertJsonPath('data.mode', 'visits')->assertJsonPath('data.items.1.key', 'checkins')->assertJsonPath('data.items.1.value', 1);
        $offer = SpecialOffer::create(['title' => 'Member offer', 'description' => 'Member offer fixture', 'type' => 'discount', 'value' => 10, 'is_active' => true, 'start_date' => '2026-09-01', 'end_date' => '2026-10-31']);
        SpecialOffer::create(['title' => 'Expired', 'description' => 'Expired offer fixture', 'type' => 'discount', 'value' => 10, 'is_active' => true, 'start_date' => '2026-09-01', 'end_date' => '2026-09-30']);
        SpecialOffer::create(['title' => 'Used up', 'description' => 'Used offer fixture', 'type' => 'discount', 'value' => 10, 'is_active' => true, 'start_date' => '2026-09-01', 'end_date' => '2026-10-31', 'usage_limit' => 1, 'times_used' => 1]);
        MemberOffer::create(['member_id' => $this->ada->id, 'offer_id' => $offer->id, 'status' => 'used', 'used_at' => '2026-10-01']);
        $this->read('metrics')->assertJsonPath('data.mode', 'discounts')->assertJsonPath('data.items.1.value', 1)->assertJsonPath('data.items.2.value', 1);
    }

    public function test_calendar_boundaries_use_venue_zone_and_all_brands(): void
    {
        $this->org->update(['timezone' => 'Europe/Riga']);
        app()->forgetScopedInstances();
        $this->ada->update(['joined_at' => '2026-09-05 21:00:00']); // venue midnight, Sept 6
        $this->grace->update(['joined_at' => '2026-09-05 20:59:59']);
        $this->read('metrics')->assertJsonPath('data.joined', 1)->assertJsonPath('period.from', '2026-09-06')->assertJsonPath('period.timezone', 'Europe/Riga');
        $this->read('metrics', 'period=90d')->assertJsonPath('period.from', '2026-07-13');
        $this->read('metrics', 'period=12m')->assertJsonPath('period.from', '2025-11-01');
        $brand = Brand::create(['name' => 'Second', 'slug' => uniqid('second'), 'organization_id' => $this->org->id]);
        $r = $this->redemption('fulfilled', '2026-10-01', '2026-10-02');
        Reward::whereKey($r->reward_id)->update(['brand_id' => $brand->id]);
        $this->read('metrics')->assertJsonPath('data.items.1.value', 1);
    }

    public function test_activity_is_bounded_filtered_and_excludes_reversed_or_future_events(): void
    {
        for ($i = 0; $i < 25; $i++) PointsTransaction::create(['member_id' => $this->ada->id, 'points' => 10,
            'balance_after' => 1500, 'description' => 'Purchase', 'type' => 'earn', 'idempotency_key' => uniqid()])->forceFill(['created_at' => '2026-10-01'])->save();
        $r = PointsTransaction::first();
        $r->update(['is_reversed' => true]);
        $future = PointsTransaction::create(['member_id' => $this->ada->id, 'points' => 25,
            'balance_after' => 1500, 'description' => 'Future', 'type' => 'earn', 'idempotency_key' => uniqid()]);
        $future->forceFill(['created_at' => '2026-10-06'])->save();
        $this->benefit('fulfilled', '2026-10-02');
        $this->grace->update(['joined_at' => '2026-10-03']);
        $result = $this->read('activity')->assertJsonCount(20, 'data.items');
        $this->assertSame(['member', 'benefit'], array_slice(array_column($result->json('data.items'), 'source'), 0, 2));
        $filtered = $this->read('activity', 'filter=points')->assertJsonCount(20, 'data.items');
        $this->assertSame(['points'], array_values(array_unique(array_column($filtered->json('data.items'), 'source'))));
        $this->assertNotContains($r->id, array_column($filtered->json('data.items'), 'id'));
        $this->assertNotContains($future->id, array_column($filtered->json('data.items'), 'id'));
        $this->read('activity', 'filter=rewards')->assertJsonCount(0, 'data.items');
    }

    public function test_missing_activity_source_fails_instead_of_returning_a_successful_zero(): void
    {
        Schema::rename('tier_qualification_counts', 'overview_missing_counts');
        try {
            // Isolate the deliberately invalid statement: PostgreSQL aborts its current transaction on SQL error.
            DB::beginTransaction();
            try {
                $this->asManager()->getJson($this->api('overview/activity'))->assertStatus(500);
            } finally { DB::rollBack(); }
            $this->read('queue')->assertJsonPath('data.total', 0);
        } finally { Schema::rename('overview_missing_counts', 'tier_qualification_counts'); }
    }

    public function test_dst_and_month_end_are_calendar_boundaries_not_fixed_hour_subtraction(): void
    {
        $this->org->update(['timezone' => 'Europe/Riga']);
        app()->forgetScopedInstances();
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-03-29 10:00:00', 'UTC'));
        $this->read('metrics')->assertJsonPath('period.from', '2026-02-28')->assertJsonPath('period.start', '2026-02-27 22:00:00');
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-31 12:00:00', 'UTC'));
        $this->read('metrics', 'period=12m')->assertJsonPath('period.from', '2025-11-01')->assertJsonPath('period.to', '2026-10-31');
    }

    public function test_existing_non_tier_programmes_are_not_misidentified_as_first_setup(): void
    {
        $this->noPoints();
        LoyaltyTier::query()->update(['is_active' => false]);
        $this->assertNull(ProgrammeOptions::for($this->org->id)['programme_setup_completed_at']);
        $this->read('summary')->assertJsonPath('data.configured', true); // existing members
        DB::table('loyalty_members')->where('organization_id', $this->org->id)->delete();
        $this->read('summary')->assertJsonPath('data.configured', false);
        SpecialOffer::create(['title' => 'Offer programme', 'description' => 'Offer programme fixture', 'type' => 'discount', 'value' => 10,
            'start_date' => '2026-10-01', 'end_date' => '2026-10-31', 'is_active' => true]);
        $this->read('summary')->assertJsonPath('data.mode', 'discounts')->assertJsonPath('data.configured', true);
        SpecialOffer::query()->update(['is_active' => false]);
        ProgrammeOptions::save($this->org->id, ['checkin_enabled' => true], $this->manager);
        $this->read('summary')->assertJsonPath('data.mode', 'visits')->assertJsonPath('data.configured', true);
        ProgrammeOptions::save($this->org->id, ['checkin_enabled' => false], $this->manager);
        BenefitDefinition::create(['name' => 'Membership service', 'code' => 'overview-service', 'is_active' => true]);
        $this->read('summary')->assertJsonPath('data.mode', 'services')->assertJsonPath('data.configured', true);
    }
}
