<?php

namespace Tests\Feature\Admin;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\TierBenefit;
use App\Services\LoyaltyPresetService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks `loyalty:type-benefits` — the console command that turns prose
 * tier-benefit text ("10% off treatments") into the typed fields
 * DiscountService actually computes with, plus the matching seam in
 * LoyaltyPresetService that types a preset's own perks at write time.
 *
 * Schema: setUpDiscountTables() (from SeedsDiscountFixture) builds
 * benefit_definitions + tier_benefits with the phase-2 columns
 * (value_type, value_amount, applies_to) already on them — this is the
 * real shape production tests use, not an inline redefinition.
 *
 * current_organization_id is bound because TierBenefit/BenefitDefinition
 * carry BelongsToOrganization's TenantScope, which fails CLOSED (returns
 * zero rows) when no tenant context is bound at all.
 */
class TypeBenefitsCommandTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SeedsDiscountFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        $this->setUpPresetExtras();

        $this->orgId = Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $this->orgId);

        $tier = LoyaltyTier::create([
            'organization_id' => $this->orgId,
            'name' => 'Gold',
            'min_points' => 0,
            'earn_rate' => 1,
            'is_active' => true,
        ]);

        foreach (['10% off treatments', '€5 off your next stay', 'Free coffee'] as $i => $text) {
            $def = BenefitDefinition::create([
                'organization_id' => $this->orgId,
                'name' => "B$i",
                'code' => "b$i",
                'category' => 'perk',
                'is_active' => true,
            ]);
            TierBenefit::create([
                'organization_id' => $this->orgId,
                'tier_id' => $tier->id,
                'benefit_id' => $def->id,
                'value' => $text,
                'value_type' => 'text',
                'is_active' => true,
            ]);
        }
    }

    /**
     * setUpDiscountTables() gives benefit_definitions/tier_benefits/rewards
     * their DiscountService shape, but LoyaltyPresetService::apply() also
     * writes benefit_definitions.description/sort_order and
     * rewards.category/sort_order (columns the DiscountService fixture
     * never needed) plus crm_settings (the picker stamp). Add exactly
     * those, guarded, rather than widening the shared fixture trait for
     * every one of its other consumers.
     */
    private function setUpPresetExtras(): void
    {
        if (!Schema::hasColumn('benefit_definitions', 'description')) {
            Schema::table('benefit_definitions', fn ($t) => $t->text('description')->nullable());
        }
        if (!Schema::hasColumn('benefit_definitions', 'sort_order')) {
            Schema::table('benefit_definitions', fn ($t) => $t->integer('sort_order')->default(0));
        }
        if (!Schema::hasColumn('rewards', 'category')) {
            Schema::table('rewards', fn ($t) => $t->string('category', 60)->nullable());
        }
        if (!Schema::hasColumn('rewards', 'sort_order')) {
            Schema::table('rewards', fn ($t) => $t->integer('sort_order')->default(0));
        }
        if (!Schema::hasTable('crm_settings')) {
            Schema::create('crm_settings', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('key', 100);
                $t->text('value')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'key']);
            });
        }
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_dry_run_lists_the_parseable_rows_and_writes_nothing(): void
    {
        $this->artisan('loyalty:type-benefits', ['--org' => $this->orgId])
            ->expectsOutputToContain('2 benefit(s) would be typed')
            ->assertExitCode(0);

        $this->assertSame(3, TierBenefit::where('value_type', 'text')->count());
    }

    public function test_apply_types_percent_and_fixed_rows_and_leaves_prose(): void
    {
        $this->artisan('loyalty:type-benefits', ['--org' => $this->orgId, '--apply' => true])
            ->assertExitCode(0);

        $rows = TierBenefit::orderBy('id')->get();

        $this->assertSame(
            ['percent_discount', 10.0, 'services'],
            [$rows[0]->value_type, (float) $rows[0]->value_amount, $rows[0]->applies_to],
        );
        $this->assertSame(
            ['fixed_amount', 5.0, 'stays'],
            [$rows[1]->value_type, (float) $rows[1]->value_amount, $rows[1]->applies_to],
        );
        $this->assertSame('text', $rows[2]->value_type);
    }

    /**
     * Final review, Minor 8: `--apply` without `--org` rewrote every
     * organisation's benefits at once. It now refuses unless `--all` says
     * that is what the operator means; the dry run stays allowed for all.
     */
    public function test_apply_refuses_to_run_across_every_organisation_without_all(): void
    {
        $this->artisan('loyalty:type-benefits', ['--apply' => true])
            ->expectsOutputToContain('--org=<id>')
            ->assertExitCode(1);

        $this->assertSame(3, TierBenefit::where('value_type', 'text')->count());
    }

    public function test_apply_with_all_types_every_organisation_and_a_dry_run_needs_neither(): void
    {
        $this->artisan('loyalty:type-benefits')
            ->expectsOutputToContain('2 benefit(s) would be typed')
            ->assertExitCode(0);
        $this->assertSame(3, TierBenefit::where('value_type', 'text')->count());

        $this->artisan('loyalty:type-benefits', ['--apply' => true, '--all' => true])
            ->expectsOutputToContain('2 benefit(s) typed')
            ->assertExitCode(0);
        $this->assertSame(1, TierBenefit::where('value_type', 'text')->count());
    }

    public function test_presets_type_a_parseable_perk_into_a_typed_tier_benefit(): void
    {
        // The beauty preset's Devotee/Inner Circle tiers carry perks
        // "15% off treatments" / "20% off treatments" / "10% off retail" —
        // shapes TypeBenefits::parse() recognises. LoyaltyPresetService::
        // apply() must run each new tier's perks through the same parser
        // and create a typed TierBenefit for every one that matches.
        app(LoyaltyPresetService::class)->apply('beauty', $this->orgId);

        $this->assertTrue(TierBenefit::withoutGlobalScopes()
            ->where('organization_id', $this->orgId)
            ->where('value_type', 'percent_discount')
            ->exists());
    }
}
