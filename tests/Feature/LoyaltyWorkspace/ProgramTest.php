<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\BenefitDefinition;
use App\Models\EarnRateEvent;
use App\Models\LoyaltyTier;
use App\Models\TierBenefit;
use App\Services\DiscountService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/** Program: tiers, their benefits, the benefit catalogue and boost events (spec 2026-10-21 §4.5, §5, §6.4, §6.5). */
class ProgramTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    public function test_it_shows_the_ladder_with_its_members_and_benefits_the_catalogue_the_boosts_and_the_options(): void
    {
        $this->otherOrganization();
        $this->makeMember('Former Member', 'former@example.test', ['is_active' => false]);
        $checkout = $this->benefit('Late checkout', 'late_checkout', 'accommodation');
        $spa = $this->benefit('Spa discount', 'spa10', 'discount', ['sort_order' => 2]);
        $text = TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $checkout->id, 'value' => 'Until 2 pm', 'value_type' => 'text', 'applies_to' => 'all', 'is_active' => true]);
        $typed = TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $spa->id, 'value' => '10% off', 'value_type' => DiscountService::PERCENT, 'value_amount' => 10, 'applies_to' => 'services', 'is_active' => true]);
        TierBenefit::create(['tier_id' => $this->tiers['silver']->id, 'benefit_id' => $spa->id, 'value' => 'Gone', 'is_active' => false]);
        $live = $this->boost('Double days', ['starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'multiplier' => 2, 'tier_ids' => [$this->tiers['gold']->id], 'days_of_week' => [1, 6]]);

        $response = $this->asStaffMember()->getJson($this->api('program'))->assertOk();

        $this->assertSame(['Silver', 'Gold', 'Platinum'], array_column($response->json('tiers'), 'name'));
        $this->assertSame([1, 1, 0], array_column($response->json('tiers'), 'members'));
        $response->assertJsonPath('tiers.1', [
            'id'          => $this->tiers['gold']->id,
            'name'        => 'Gold',
            'description' => null,
            'color'       => '#d4a017',
            'min_points'  => 1000,
            'min_nights'  => null,
            'min_stays'   => null,
            'min_spend'   => null,
            'earn_rate'   => 1.25,
            'is_active'   => true,
            'sort_order'  => 2,
            'members'     => 1,
            'benefits'    => [
                ['id' => $text->id, 'benefit_id' => $checkout->id, 'name' => 'Late checkout', 'category' => 'accommodation', 'value' => 'Until 2 pm', 'value_type' => 'text', 'value_amount' => null, 'applies_to' => 'all'],
                ['id' => $typed->id, 'benefit_id' => $spa->id, 'name' => 'Spa discount', 'category' => 'discount', 'value' => '10% off', 'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services'],
            ],
        ]);
        // A benefit taken off a tier is not on it.
        $response->assertJsonPath('tiers.0.benefits', []);

        $response->assertJsonPath('benefits.0', ['id' => $checkout->id, 'name' => 'Late checkout', 'code' => 'late_checkout', 'description' => null, 'category' => 'accommodation', 'fulfillment_mode' => 'on_request', 'is_active' => true, 'sort_order' => 0])
            ->assertJsonPath('benefits.1.code', 'spa10')
            ->assertJsonCount(2, 'benefits');

        $response->assertJsonPath('boosts.0', [
            'id'           => $live->id,
            'brand_id'     => $this->brandId,
            'name'         => 'Double days',
            'description'  => null,
            'multiplier'   => 2,
            'starts_at'    => '2026-10-04T09:00:00+00:00',
            'ends_at'      => '2026-10-06T09:00:00+00:00',
            'days_of_week' => [1, 6],
            'tier_ids'     => [$this->tiers['gold']->id],
            'is_active'    => true,
            'state'        => 'live',
            'check_time'   => false,
        ]);

        $response->assertJsonPath('options.categories', ['accommodation', 'dining', 'wellness', 'transport', 'recognition', 'points', 'access', 'discount', 'other'])
            ->assertJsonPath('options.fulfillment_modes', ['automatic', 'staff_approved', 'pms_linked', 'voucher', 'on_request'])
            ->assertJsonPath('options.value_types', DiscountService::VALUE_TYPES)
            ->assertJsonPath('options.applies_to', ['all', 'services', 'stays']);
    }

    public function test_a_boost_is_live_upcoming_ended_or_off(): void
    {
        $this->boost('Live', ['starts_at' => now()->subHour(), 'ends_at' => now()->addHour()]);
        $this->boost('Upcoming', ['starts_at' => now()->addDays(3), 'ends_at' => now()->addDays(4)]);
        $this->boost('Ended', ['starts_at' => now()->subDays(4), 'ends_at' => now()->subDays(3)]);
        $this->boost('Off', ['starts_at' => now()->subHour(), 'ends_at' => now()->addHour(), 'is_active' => false]);

        $boosts = collect($this->asStaffMember()->getJson($this->api('program'))->json('boosts'))->pluck('state', 'name')->sortKeys()->all();

        $this->assertSame(['Ended' => 'ended', 'Live' => 'live', 'Off' => 'off', 'Upcoming' => 'upcoming'], $boosts);
    }

    public function test_only_a_manager_changes_the_programme(): void
    {
        $benefit = $this->benefit('Late checkout', 'late_checkout', 'accommodation');
        $given = TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $benefit->id, 'value' => 'Until 2 pm', 'is_active' => true]);
        $boost = $this->boost('Double days');
        $gold = $this->tiers['gold']->id;

        $calls = [
            ['postJson', 'program/tiers', ['name' => 'Diamond', 'min_points' => 9000, 'earn_rate' => 2]],
            ['putJson', "program/tiers/{$gold}", ['name' => 'Golden']],
            ['postJson', "program/tiers/{$gold}/benefits", ['benefit_id' => $benefit->id]],
            ['deleteJson', "program/tiers/{$gold}/benefits/{$given->id}", []],
            ['postJson', 'program/benefits', ['name' => 'Spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']],
            ['putJson', "program/benefits/{$benefit->id}", ['is_active' => false]],
            ['postJson', 'program/boosts', $this->boostBody()],
            ['putJson', "program/boosts/{$boost->id}", $this->boostBody(['name' => 'Renamed'])],
            ['deleteJson', "program/boosts/{$boost->id}", []],
        ];
        foreach ($calls as [$method, $path, $body]) {
            $this->asStaffMember()->{$method}($this->api($path), $body)
                ->assertStatus(403)->assertJsonPath('error', 'manager_only');
        }

        $this->assertSame('Gold', $this->tiers['gold']->fresh()->name);
        $this->assertSame(3, LoyaltyTier::query()->count());
        $this->assertTrue($given->fresh()->is_active);
        $this->assertTrue($benefit->fresh()->is_active);
        $this->assertSame('Double days', $boost->fresh()->name);
    }

    public function test_a_manager_adds_a_tier_at_the_end_of_the_ladder_and_changes_it(): void
    {
        $response = $this->asManager()->postJson($this->api('program/tiers'), [
            'name' => 'Diamond', 'color' => '#1E3A8A', 'min_points' => 9000, 'earn_rate' => 2, 'description' => 'For the few.',
        ])->assertCreated();

        $id = $response->json('tier.id');
        $response->assertJsonPath('tier', [
            'id' => $id, 'name' => 'Diamond', 'description' => 'For the few.', 'color' => '#1E3A8A', 'min_points' => 9000,
            'min_nights' => null, 'min_stays' => null, 'min_spend' => null, 'earn_rate' => 2, 'is_active' => true,
            'sort_order' => 4, 'members' => 0, 'benefits' => [],
        ]);
        $this->assertTrue(AuditLog::query()->where('action', 'tier_created')->where('subject_id', $id)->exists());

        // The form sends an emptied colour as null: the tier keeps its colour (`color_hex` is NOT NULL in production).
        $this->asManager()->putJson($this->api("program/tiers/{$id}"), ['earn_rate' => 2.5, 'is_active' => false, 'color' => null])
            ->assertOk()
            ->assertJsonPath('tier.name', 'Diamond')
            ->assertJsonPath('tier.earn_rate', 2.5)
            ->assertJsonPath('tier.is_active', false)
            ->assertJsonPath('tier.color', '#1E3A8A');

        // A tier added with no colour gets the column's default.
        $this->asManager()->postJson($this->api('program/tiers'), ['name' => 'Opal', 'color' => null, 'min_points' => 12000, 'earn_rate' => 2])
            ->assertCreated()
            ->assertJsonPath('tier.color', '#CD7F32');

        $this->asManager()->putJson($this->api("program/tiers/{$this->tiers['gold']->id}"), ['min_points' => 1200])
            ->assertJsonPath('tier.members', 1)
            ->assertJsonPath('tier.min_points', 1200);
    }

    public function test_a_tier_form_is_checked(): void
    {
        $this->asManager()->postJson($this->api('program/tiers'), ['name' => 'Diamond', 'color' => 'blue', 'min_points' => -1, 'earn_rate' => 100])
            ->assertStatus(422)->assertJsonValidationErrors(['color', 'min_points', 'earn_rate']);
        $this->asManager()->postJson($this->api('program/tiers'), [])
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'min_points', 'earn_rate']);
        $this->asManager()->putJson($this->api("program/tiers/{$this->tiers['gold']->id}"), ['name' => ''])
            ->assertStatus(422)->assertJsonValidationErrors(['name']);
    }

    public function test_a_tier_benefit_keeps_the_full_admins_rules(): void
    {
        $spa = $this->benefit('Spa discount', 'spa10', 'discount');
        $points = $this->benefit('Points boost', 'boost', 'points');
        $gold = $this->tiers['gold']->id;

        $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), ['benefit_id' => $spa->id, 'value_type' => DiscountService::PERCENT, 'value_amount' => 150])
            ->assertStatus(422)->assertJsonValidationErrors(['value_amount']);
        $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), ['benefit_id' => $points->id, 'value_type' => DiscountService::MULTIPLIER, 'value_amount' => 0.5])
            ->assertStatus(422)->assertJsonValidationErrors(['value_amount']);
        $this->assertSame(0, TierBenefit::query()->count());

        $first = $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), [
            'benefit_id' => $spa->id, 'value' => '10% off', 'value_type' => DiscountService::PERCENT, 'value_amount' => 10, 'applies_to' => 'services',
        ])->assertOk();
        $id = $first->json('tier_benefit.id');
        $first->assertJsonPath('tier_benefit', [
            'id' => $id, 'benefit_id' => $spa->id, 'name' => 'Spa discount', 'category' => 'discount', 'value' => '10% off',
            'value_type' => 'percent_discount', 'value_amount' => 10, 'applies_to' => 'services',
        ]);

        // Rewording keeps the typed value: the same row, still an enforceable 10%.
        $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), ['benefit_id' => $spa->id, 'value' => 'Ten percent off'])
            ->assertOk()
            ->assertJsonPath('tier_benefit.id', $id)
            ->assertJsonPath('tier_benefit.value', 'Ten percent off')
            ->assertJsonPath('tier_benefit.value_type', 'percent_discount')
            ->assertJsonPath('tier_benefit.value_amount', 10)
            ->assertJsonPath('tier_benefit.applies_to', 'services');

        // Sent as text, the amount goes.
        $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), ['benefit_id' => $spa->id, 'value_type' => 'text', 'value_amount' => 10])
            ->assertJsonPath('tier_benefit.value_type', 'text')
            ->assertJsonPath('tier_benefit.value_amount', null);

        $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), ['benefit_id' => $points->id, 'value_type' => DiscountService::MULTIPLIER, 'value_amount' => 1.5])
            ->assertOk()->assertJsonPath('tier_benefit.value_amount', 1.5)->assertJsonPath('tier_benefit.applies_to', 'all');
        $this->assertSame(2, TierBenefit::query()->where('tier_id', $gold)->count());
    }

    public function test_taking_a_benefit_off_a_tier_switches_it_off(): void
    {
        $benefit = $this->benefit('Late checkout', 'late_checkout', 'accommodation');
        $given = TierBenefit::create(['tier_id' => $this->tiers['gold']->id, 'benefit_id' => $benefit->id, 'value' => 'Until 2 pm', 'is_active' => true]);

        // Through another tier's address it is not found.
        $this->asManager()->deleteJson($this->api("program/tiers/{$this->tiers['silver']->id}/benefits/{$given->id}"))
            ->assertStatus(404)->assertJsonPath('error', 'not_found');

        $this->asManager()->deleteJson($this->api("program/tiers/{$this->tiers['gold']->id}/benefits/{$given->id}"))
            ->assertOk()->assertExactJson(['ok' => true]);

        $this->assertFalse($given->fresh()->is_active);
        $this->asManager()->getJson($this->api('program'))->assertJsonPath('tiers.1.benefits', []);

        // Given again, the same row comes back on.
        $this->asManager()->postJson($this->api("program/tiers/{$this->tiers['gold']->id}/benefits"), ['benefit_id' => $benefit->id])
            ->assertOk()->assertJsonPath('tier_benefit.id', $given->id)->assertJsonPath('tier_benefit.value', 'Until 2 pm');
        $this->assertTrue($given->fresh()->is_active);
    }

    public function test_the_catalogue_takes_a_benefit_whose_code_is_new_to_this_organisation(): void
    {
        $other = $this->otherOrganization();
        $this->inOrganization($other['org']->id, fn () => BenefitDefinition::create(['name' => 'Their spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']));

        $response = $this->asManager()->postJson($this->api('program/benefits'), [
            'name' => 'Spa access', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'staff_approved', 'description' => 'The spa, any day.',
        ])->assertCreated();
        $id = $response->json('benefit.id');
        $response->assertJsonPath('benefit', [
            'id' => $id, 'name' => 'Spa access', 'code' => 'spa', 'description' => 'The spa, any day.', 'category' => 'wellness',
            'fulfillment_mode' => 'staff_approved', 'is_active' => true, 'sort_order' => 0,
        ]);

        $this->asManager()->postJson($this->api('program/benefits'), ['name' => 'Spa again', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request'])
            ->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->asManager()->postJson($this->api('program/benefits'), ['name' => 'Odd', 'code' => 'odd', 'category' => 'gift', 'fulfillment_mode' => 'by_magic'])
            ->assertStatus(422)->assertJsonValidationErrors(['category', 'fulfillment_mode']);

        // A change: the code stays as it was made.
        $this->asManager()->putJson($this->api("program/benefits/{$id}"), ['name' => 'Spa day', 'is_active' => false, 'code' => 'changed'])
            ->assertOk()
            ->assertJsonPath('benefit.name', 'Spa day')
            ->assertJsonPath('benefit.is_active', false)
            ->assertJsonPath('benefit.code', 'spa');
    }

    public function test_a_manager_adds_changes_and_removes_a_boost(): void
    {
        $gold = $this->tiers['gold']->id;

        $response = $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody([
            'days_of_week' => [5, 6], 'tier_ids' => [$gold],
        ]))->assertCreated();
        $id = $response->json('boost.id');
        $response->assertJsonPath('boost', [
            'id' => $id, 'brand_id' => $this->brandId, 'name' => 'Weekend double', 'description' => 'Twice the points.', 'multiplier' => 2,
            'starts_at' => '2026-10-04T00:00:00+00:00', 'ends_at' => '2026-10-11T00:00:00+00:00',
            'days_of_week' => [5, 6], 'tier_ids' => [$gold], 'is_active' => true, 'state' => 'live', 'check_time' => false,
        ]);
        $this->assertSame([$gold], EarnRateEvent::query()->find($id)->tier_ids);

        $this->asManager()->putJson($this->api("program/boosts/{$id}"), $this->boostBody([
            'starts_at' => '2026-10-12T00:00:00Z', 'ends_at' => '2026-10-13T00:00:00Z', 'tier_ids' => [], 'days_of_week' => null,
        ]))->assertOk()
            ->assertJsonPath('boost.state', 'upcoming')
            ->assertJsonPath('boost.tier_ids', null)
            ->assertJsonPath('boost.days_of_week', null);

        $this->asManager()->putJson($this->api("program/boosts/{$id}"), $this->boostBody(['is_active' => false]))
            ->assertJsonPath('boost.state', 'off');

        $this->asManager()->deleteJson($this->api("program/boosts/{$id}"))->assertOk()->assertExactJson(['ok' => true]);
        $this->assertNull(EarnRateEvent::query()->find($id));
        $this->assertTrue(AuditLog::query()->where('action', 'earn_rate_event_deleted')->exists());
    }

    public function test_a_boost_form_is_checked(): void
    {
        $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody(['multiplier' => 11]))
            ->assertStatus(422)->assertJsonValidationErrors(['multiplier']);
        $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody(['multiplier' => 0.5]))
            ->assertStatus(422)->assertJsonValidationErrors(['multiplier']);
        $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody(['ends_at' => '2026-10-03T00:00:00Z']))
            ->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody(['days_of_week' => [7]]))
            ->assertStatus(422)->assertJsonValidationErrors(['days_of_week.0']);
        $this->assertSame(0, EarnRateEvent::query()->count());
    }

    public function test_a_boost_time_without_an_offset_is_the_venues_wall_clock(): void
    {
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();

        $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody(['starts_at' => '2026-10-06T09:00', 'ends_at' => '2026-10-06T21:00:00+03:00']))
            ->assertCreated()
            ->assertJsonPath('boost.starts_at', '2026-10-06T06:00:00+00:00')
            ->assertJsonPath('boost.ends_at', '2026-10-06T18:00:00+00:00')
            ->assertJsonPath('boost.state', 'upcoming');
    }

    public function test_another_organisations_ids_are_not_found_in_the_address_and_refused_in_a_body(): void
    {
        $other = $this->otherOrganization();
        $theirTier = $other['tier']->id;
        $theirBenefit = $this->inOrganization($other['org']->id, fn () => BenefitDefinition::create(['name' => 'Their spa', 'code' => 'spa', 'category' => 'wellness', 'fulfillment_mode' => 'on_request']));
        $theirGiven = $this->inOrganization($other['org']->id, fn () => TierBenefit::create(['tier_id' => $theirTier, 'benefit_id' => $theirBenefit->id, 'is_active' => true]));
        $theirBoost = $this->inOrganization($other['org']->id, fn () => $this->boost('Their boost'));
        $gold = $this->tiers['gold']->id;

        foreach ([
            ['putJson', "program/tiers/{$theirTier}", ['name' => 'Mine now']],
            ['postJson', "program/tiers/{$theirTier}/benefits", ['benefit_id' => $theirBenefit->id]],
            ['deleteJson', "program/tiers/{$theirTier}/benefits/{$theirGiven->id}", []],
            ['deleteJson', "program/tiers/{$gold}/benefits/{$theirGiven->id}", []],
            ['putJson', "program/benefits/{$theirBenefit->id}", ['is_active' => false]],
            ['putJson', "program/boosts/{$theirBoost->id}", $this->boostBody()],
            ['deleteJson', "program/boosts/{$theirBoost->id}", []],
        ] as [$method, $path, $body]) {
            $this->asManager()->{$method}($this->api($path), $body)->assertStatus(404)->assertJsonPath('error', 'not_found');
        }

        $this->asManager()->postJson($this->api("program/tiers/{$gold}/benefits"), ['benefit_id' => $theirBenefit->id])
            ->assertStatus(422)->assertJsonValidationErrors(['benefit_id']);
        $this->asManager()->postJson($this->api('program/boosts'), $this->boostBody(['tier_ids' => [$gold, $theirTier]]))
            ->assertStatus(422)->assertJsonValidationErrors(['tier_ids.1'])->assertJsonMissingValidationErrors(['tier_ids.0']);

        // Their rows are as they were, and none of theirs shows here.
        $this->assertTrue(TierBenefit::withoutGlobalScopes()->find($theirGiven->id)->is_active);
        $this->assertNotNull(EarnRateEvent::withoutGlobalScopes()->find($theirBoost->id));
        $program = $this->asManager()->getJson($this->api('program'));
        $this->assertNotContains('Bronze', array_column($program->json('tiers'), 'name'));
        $program->assertJsonPath('benefits', [])->assertJsonPath('boosts', []);
    }

    /** A benefit of the catalogue of the organisation bound now. */
    protected function benefit(string $name, string $code, string $category, array $attributes = []): BenefitDefinition
    {
        return BenefitDefinition::create($attributes + ['name' => $name, 'code' => $code, 'category' => $category, 'fulfillment_mode' => 'on_request']);
    }

    /** A boost event of the organisation bound now; live by default. */
    protected function boost(string $name, array $attributes = []): EarnRateEvent
    {
        return EarnRateEvent::create($attributes + ['name' => $name, 'multiplier' => 2, 'starts_at' => now()->subDay(), 'ends_at' => now()->addDay(), 'is_active' => true]);
    }

    /** @return array<string, mixed> A whole boost form, live on the fixed clock (Monday 5 October 2026). */
    protected function boostBody(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Weekend double', 'description' => 'Twice the points.', 'multiplier' => 2,
            'starts_at' => '2026-10-04T00:00:00+00:00', 'ends_at' => '2026-10-11T00:00:00+00:00',
        ];
    }

    /** Runs $make under another organisation's tenant and hands back what it made, ours restored. */
    protected function inOrganization(int $orgId, callable $make): mixed
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $orgId);
        try {
            return $make();
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }
}
