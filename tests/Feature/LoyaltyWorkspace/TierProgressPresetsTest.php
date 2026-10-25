<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AccessPlace;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\LoyaltyPresetService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\ValiditySchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The two presets for general memberships (release 8, spec 2026-10-25 §3): "Members' club" (tiers by visits: Member,
 * Regular, Insider from 0, 10 and 30 visits) and "Events & community" (tiers by visits, stamps on), offered in the setup
 * wizard with what they recommend. Applied, a ladder by visits is judged by visits (`tier_progress_by`), the wizard's or
 * the full admin's picker alike. A preset adds no places: the venue adds its own.
 */
class TierProgressPresetsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, ValiditySchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpLoyaltyPresetSchema();
        $this->buildValiditySchema();
    }

    /** @return array{0: Organization, 1: \App\Models\User} a venue with no tier and no member, and its manager */
    private function newVenue(): array
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $venue = Organization::create(['name' => 'North Club', 'slug' => 'club-' . uniqid('', true), 'industry' => 'other']);
        app()->instance('current_organization_id', $venue->id);
        $manager = $this->staffUser($venue, ['can_award_points' => true, 'can_redeem_points' => true]);
        app()->instance('current_organization_id', $prior);

        return [$venue, $manager];
    }

    public function test_the_wizard_offers_both_with_their_ladders_and_what_they_recommend(): void
    {
        $presets = collect($this->asManager()->getJson($this->api('options'))->assertOk()->json('presets'))->keyBy('key');

        $this->assertSame(['Member', 'Regular', 'Insider'], $presets['members_club']['tier_names']);
        $this->assertSame('users', $presets['members_club']['icon']);
        $this->assertSame('visits', $presets['members_club']['recommends']['tier_progress_by']);
        $this->assertTrue($presets['members_club']['recommends']['checkin_enabled']);

        $this->assertSame(['Newcomer', 'Regular', 'Ambassador'], $presets['events_community']['tier_names']);
        $this->assertSame('visits', $presets['events_community']['recommends']['tier_progress_by']);
        $this->assertTrue($presets['events_community']['recommends']['stamps_enabled']);

        // Every other preset recommends points, as the programmes have always been judged.
        foreach ($presets->except(['members_club', 'events_community']) as $key => $preset) {
            $this->assertSame('points', $preset['recommends']['tier_progress_by'], $key);
        }
    }

    public function test_the_wizard_builds_the_members_club_and_judges_it_by_visits(): void
    {
        [$venue, $manager] = $this->newVenue();
        $recommends = app(LoyaltyPresetService::class)->recommendedOptions('members_club');

        $this->actingAs($manager, 'sanctum')->postJson($this->api('options/setup'), ['preset' => 'members_club', 'options' => $recommends])
            ->assertOk()
            ->assertJsonPath('setup.preset_applied', true)
            ->assertJsonPath('options.tier_progress_by', 'visits')
            ->assertJsonPath('options.checkin_enabled', true);

        $tiers = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->orderBy('sort_order')->get();
        $this->assertSame([['Member', 0], ['Regular', 10], ['Insider', 30]], $tiers->map(fn (LoyaltyTier $t) => [$t->name, (int) $t->min_visits])->all());
        if (Schema::hasTable('access_places')) {
            $this->assertSame(0, AccessPlace::withoutGlobalScopes()->where('organization_id', $venue->id)->count(), 'a preset adds no places');
        }
    }

    public function test_applied_from_the_full_admins_picker_the_ladder_by_visits_is_judged_by_visits(): void
    {
        [$venue] = $this->newVenue();
        // The full admin's picker runs under the venue's own tenant, as every request does.
        app()->instance('current_organization_id', $venue->id);

        $summary = app(LoyaltyPresetService::class)->apply('events_community', (int) $venue->id);

        $this->assertSame('visits', $summary['tier_progress_by']);
        $this->assertSame('visits', ProgrammeOptions::get((int) $venue->id, 'tier_progress_by'));
        $this->assertSame([0, 5, 15], LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->orderBy('sort_order')->pluck('min_visits')->map(fn ($v) => (int) $v)->all());

        // A venue judged on points keeps its measure when a points preset is applied.
        [$other] = $this->newVenue();
        app()->instance('current_organization_id', $other->id);
        app(LoyaltyPresetService::class)->apply('fitness', (int) $other->id);
        $this->assertSame('points', ProgrammeOptions::get((int) $other->id, 'tier_progress_by'));
    }

    /**
     * Review fix: a clean replace always says how its ladder is judged. The club's ladder by visits, then the hotel's by
     * points from the full admin's picker (still no member): the hotel's tiers have no visits floor, so the venue must
     * be judged by points again, or nobody could ever move up.
     */
    public function test_a_points_preset_applied_after_a_visits_one_puts_the_measure_back_to_points(): void
    {
        [$venue] = $this->newVenue();
        app()->instance('current_organization_id', $venue->id);
        $presets = app(LoyaltyPresetService::class);

        $presets->apply('members_club', (int) $venue->id);
        $this->assertSame('visits', ProgrammeOptions::get((int) $venue->id, 'tier_progress_by'));

        $summary = $presets->apply('hotel_classic', (int) $venue->id);

        $this->assertTrue($summary['replaced']);
        $this->assertSame('points', $summary['tier_progress_by']);
        $this->assertSame('points', ProgrammeOptions::get((int) $venue->id, 'tier_progress_by'));
        $this->assertSame([], LoyaltyTier::withoutGlobalScopes()->where('organization_id', $venue->id)->whereNotNull('min_visits')->pluck('name')->all());
    }
}
