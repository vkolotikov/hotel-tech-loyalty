<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Services\LoyaltyPresetService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class ProvisionLoyaltyProgrammeTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyPresetSchema();
        if (!Schema::hasColumn('organizations', 'industry')) {
            Schema::table('organizations', fn ($t) => $t->string('industry', 32)->nullable());
        }
        if (!Schema::hasTable('rewards')) {
            Schema::create('rewards', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->string('category', 60)->nullable();
                $t->integer('points_cost')->default(0);
                $t->boolean('is_active')->default(true);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
            });
        }
        Mail::fake();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function org(string $industry, bool $withTier = false): Organization
    {
        $org = Organization::create(['name' => ucfirst($industry) . ' venue', 'slug' => $industry . '-' . uniqid(), 'industry' => $industry]);
        if ($withTier) {
            LoyaltyTier::withoutGlobalScopes()->create(['organization_id' => $org->id, 'name' => 'Own tier', 'min_points' => 0, 'is_active' => true]);
        }
        return $org;
    }

    private function tiers(Organization $org): array
    {
        return LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->orderBy('min_points')->pluck('name')->all();
    }

    /** An org with a single INACTIVE tier — a paused programme, not none. */
    private function pausedOrg(string $industry = 'medical'): array
    {
        $org = $this->org($industry);
        $tier = LoyaltyTier::withoutGlobalScopes()->create([
            'organization_id' => $org->id, 'name' => 'Retired Tier', 'min_points' => 0, 'is_active' => false,
        ]);
        return [$org, $tier];
    }

    public function test_it_only_reports_until_told_to_apply(): void
    {
        $clinic = $this->org('medical');

        Artisan::call('loyalty:provision-programme', ['--all' => true]);

        $this->assertStringContainsString("would give org {$clinic->id}", Artisan::output());
        $this->assertSame([], $this->tiers($clinic));
    }

    public function test_it_gives_a_venue_without_tiers_its_industrys_programme(): void
    {
        $clinic = $this->org('medical');
        $salon = $this->org('beauty');

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Patient', 'Care Plus'], $this->tiers($clinic));
        $this->assertSame(['Welcome', 'Devotee', 'Inner Circle'], $this->tiers($salon));
        Mail::assertNothingQueued();
        Mail::assertNothingSent();
    }

    public function test_a_venue_that_has_a_tier_is_left_exactly_as_it_is(): void
    {
        $own = $this->org('medical', withTier: true);

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Own tier'], $this->tiers($own));
    }

    /** The guard asks the database whether tier rows exist; it never loads them. */
    public function test_the_guard_uses_exists_queries(): void
    {
        $this->org('medical', withTier: true);
        $this->pausedOrg();
        $tierQueries = [];
        \Illuminate\Support\Facades\DB::listen(function ($q) use (&$tierQueries) {
            if (str_contains($q->sql, 'loyalty_tiers')) {
                $tierQueries[] = $q->sql;
            }
        });

        Artisan::call('loyalty:provision-programme', ['--all' => true]);

        $this->assertNotEmpty($tierQueries);
        foreach ($tierQueries as $sql) {
            $this->assertStringContainsString('exists', strtolower($sql));
        }
        $this->assertStringContainsString('has a paused programme — skipped', Artisan::output());
    }

    /* ─── a paused programme (tier rows exist, none active) is not "none" ─── */

    public function test_a_paused_programme_is_left_alone_without_apply(): void
    {
        [$clinic, $tier] = $this->pausedOrg();
        // Fetched fresh (not the in-memory create() result) so the "before"
        // and "after" snapshots come from the same column order.
        $before = LoyaltyTier::withoutGlobalScopes()->find($tier->id)->getAttributes();

        Artisan::call('loyalty:provision-programme', ['--all' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString("org {$clinic->id}", $output);
        $this->assertStringContainsString('has a paused programme — skipped', $output);
        $this->assertSame(['Retired Tier'], $this->tiers($clinic));
        $reloaded = LoyaltyTier::withoutGlobalScopes()->find($tier->id);
        $this->assertSame($tier->id, $reloaded->id);
        $this->assertSame($before, $reloaded->getAttributes());
    }

    public function test_a_paused_programme_is_left_alone_with_apply(): void
    {
        [$clinic, $tier] = $this->pausedOrg();
        $before = LoyaltyTier::withoutGlobalScopes()->find($tier->id)->getAttributes();

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Retired Tier'], $this->tiers($clinic));
        $reloaded = LoyaltyTier::withoutGlobalScopes()->find($tier->id);
        $this->assertSame($tier->id, $reloaded->id);
        $this->assertSame($before, $reloaded->getAttributes());
    }

    public function test_a_paused_programme_with_apply_named_by_org_is_also_left_alone(): void
    {
        [$clinic, $tier] = $this->pausedOrg();

        $this->artisan('loyalty:provision-programme', ['--org' => $clinic->id, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Retired Tier'], $this->tiers($clinic));
    }

    public function test_a_paused_programme_with_members_is_also_left_alone(): void
    {
        [$clinic, $tier] = $this->pausedOrg();
        LoyaltyMember::withoutGlobalScopes()->create([
            'organization_id' => $clinic->id, 'user_id' => 1, 'tier_id' => $tier->id, 'member_number' => 'HL-1',
        ]);

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame(['Retired Tier'], $this->tiers($clinic));
    }

    /* ─── one venue's failure does not stop the others ──────────────────── */

    public function test_one_organisations_failure_does_not_stop_the_others(): void
    {
        $bad = $this->org('medical');
        $good = $this->org('beauty');

        $this->app->bind(LoyaltyPresetService::class, function () use ($bad) {
            return new class($bad->id) extends LoyaltyPresetService {
                public function __construct(private int $failingOrgId)
                {
                }

                public function apply(string $key, int $organizationId): array
                {
                    if ($organizationId === $this->failingOrgId) {
                        throw new \RuntimeException('boom');
                    }

                    return parent::apply($key, $organizationId);
                }
            };
        });

        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);

        $this->assertSame([], $this->tiers($bad));
        $this->assertSame(['Welcome', 'Devotee', 'Inner Circle'], $this->tiers($good));
    }

    public function test_one_venue_can_be_named_and_a_scope_is_required(): void
    {
        $a = $this->org('medical');
        $b = $this->org('medical');

        $this->artisan('loyalty:provision-programme', ['--apply' => true])->assertExitCode(1);
        $this->assertSame([], $this->tiers($a));

        $this->artisan('loyalty:provision-programme', ['--org' => $a->id, '--apply' => true])->assertExitCode(0);
        $this->assertSame(['Patient', 'Care Plus'], $this->tiers($a));
        $this->assertSame([], $this->tiers($b));
    }

    public function test_it_leaves_no_tenant_bound_behind(): void
    {
        $this->org('medical');
        $this->artisan('loyalty:provision-programme', ['--all' => true, '--apply' => true])->assertExitCode(0);
        $this->assertFalse(app()->bound('current_organization_id'));
    }
}
