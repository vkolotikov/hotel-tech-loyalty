<?php

namespace Tests\Feature\Console;

use App\Models\Organization;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * `php artisan brands:ensure-default` — gives every organisation left without
 * a default brand (by the `created` hook's tenant bug, found 2026-10-23) its
 * default brand. Dry run unless --apply, idempotent, and it writes for the
 * organisation it names whatever tenant is bound, which the tests here bind
 * on purpose: that is how the organisations lost their brands.
 *
 * The brands table carries production's unique indexes (setUpBrandsSchema).
 */
class BrandsEnsureDefaultTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private Organization $healthy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBrandsSchema();

        // Has its default brand (from the `created` hook), and is the tenant
        // bound while the command runs.
        $this->healthy = OrganizationFactory::new()->create(['name' => 'Healthy Hotel']);
        app()->instance('current_organization_id', $this->healthy->id);
    }

    public function test_a_dry_run_names_each_organisation_and_what_it_would_do_and_writes_nothing(): void
    {
        $bare   = $this->orgWithoutBrands('Bare Spa');
        $branded = $this->orgWithoutBrands('Branded Clinic');
        $brandId = $this->insertBrand($branded->id, 'Clinic North', isDefault: false);
        $before = DB::table('brands')->orderBy('id')->get();

        $this->artisan('brands:ensure-default')
            ->expectsOutputToContain('DRY RUN — 2 organisation(s) without a default brand.')
            ->expectsOutputToContain("org #{$bare->id} (Bare Spa): would create its default brand")
            ->expectsOutputToContain("org #{$branded->id} (Branded Clinic): would make brand #{$brandId} 'Clinic North' its default")
            ->doesntExpectOutputToContain("org #{$this->healthy->id} ")
            ->expectsOutputToContain('Re-run with --apply to write.')
            ->assertExitCode(0)
            ->run();

        $this->assertEquals($before, DB::table('brands')->orderBy('id')->get());
    }

    public function test_apply_gives_each_organisation_its_default_brand_under_its_own_id_and_a_second_run_finds_nothing(): void
    {
        $bare    = $this->orgWithoutBrands('Bare Spa');
        $branded = $this->orgWithoutBrands('Branded Clinic');
        $brandId = $this->insertBrand($branded->id, 'Clinic North', isDefault: false);
        $healthyBefore = $this->brandsOf($this->healthy->id);

        $this->artisan('brands:ensure-default', ['--apply' => true])
            ->expectsOutputToContain('APPLY — 2 organisation(s) without a default brand.')
            ->expectsOutputToContain("org #{$branded->id} (Branded Clinic): made brand #{$brandId} 'Clinic North' its default")
            ->expectsOutputToContain('2 organisation(s) given a default brand.')
            ->assertExitCode(0)
            ->run();

        $created = $this->defaultsOf($bare->id);
        $this->assertCount(1, $created);
        $this->assertSame('Bare Spa', $created[0]->name);
        $this->assertSame('bare-spa', $created[0]->slug);
        $this->assertSame($bare->widget_token, $created[0]->widget_token);

        $promoted = $this->defaultsOf($branded->id);
        $this->assertCount(1, $promoted);
        $this->assertSame($brandId, (int) $promoted[0]->id);
        $this->assertCount(1, $this->brandsOf($branded->id));

        // The bound tenant got nothing, and is still the bound tenant.
        $this->assertEquals($healthyBefore, $this->brandsOf($this->healthy->id));
        $this->assertSame($this->healthy->id, app('current_organization_id'));

        $after = DB::table('brands')->orderBy('id')->get();
        $this->artisan('brands:ensure-default', ['--apply' => true])
            ->expectsOutputToContain('APPLY — 0 organisation(s) without a default brand.')
            ->assertExitCode(0)
            ->run();
        $this->assertEquals($after, DB::table('brands')->orderBy('id')->get());
    }

    public function test_org_limits_the_run_to_that_organisation(): void
    {
        $first  = $this->orgWithoutBrands('First Venue');
        $second = $this->orgWithoutBrands('Second Venue');

        $this->artisan('brands:ensure-default', ['--org' => (string) $second->id, '--apply' => true])
            ->expectsOutputToContain('APPLY — 1 organisation(s) without a default brand.')
            ->doesntExpectOutputToContain("org #{$first->id} ")
            ->assertExitCode(0)
            ->run();

        $this->assertCount(1, $this->defaultsOf($second->id));
        $this->assertCount(0, $this->brandsOf($first->id));

        // An organisation that has its default brand is reported as fine.
        $this->artisan('brands:ensure-default', ['--org' => (string) $this->healthy->id])
            ->expectsOutputToContain('DRY RUN — 0 organisation(s) without a default brand.')
            ->assertExitCode(0)
            ->run();
    }

    public function test_an_unknown_organisation_is_an_error(): void
    {
        $missing = (int) DB::table('organizations')->max('id') + 100;

        $this->artisan('brands:ensure-default', ['--org' => (string) $missing])
            ->expectsOutputToContain("No organisation with id {$missing}.")
            ->assertExitCode(1)
            ->run();

        $this->artisan('brands:ensure-default', ['--org' => 'abc'])
            ->expectsOutputToContain('No organisation with id abc.')
            ->assertExitCode(1)
            ->run();
    }

    public function test_an_organisation_whose_widget_token_another_brand_carries_is_skipped_and_named(): void
    {
        $orphan = $this->orgWithoutBrands('Orphan Venue');
        // The row the bug could have written: the orphan's default brand,
        // filed under the bound organisation (possible only while that one
        // had no live default of its own).
        $misfiled = $this->insertBrand($this->healthy->id, 'Orphan Venue', isDefault: false, token: $orphan->widget_token);
        $before = DB::table('brands')->orderBy('id')->get();

        $this->artisan('brands:ensure-default', ['--apply' => true])
            ->expectsOutputToContain("org #{$orphan->id} (Orphan Venue): skipped — its widget token is already carried by brand #{$misfiled} (organisation #{$this->healthy->id})")
            ->expectsOutputToContain('0 organisation(s) given a default brand. 1 need a person.')
            ->assertExitCode(1)
            ->run();

        $this->assertEquals($before, DB::table('brands')->orderBy('id')->get());
    }

    public function test_an_organisation_with_only_deleted_brands_gets_a_new_default_with_a_free_slug(): void
    {
        $org = $this->orgWithoutBrands('Phoenix Bar');
        // Deleted, under the slug the default would take; the slug unique
        // is not partial, so deleted rows still hold their slug.
        $deleted = $this->insertBrand($org->id, 'Phoenix Bar', isDefault: true, slug: 'phoenix-bar', deleted: true);

        $this->artisan('brands:ensure-default', ['--apply' => true])
            ->expectsOutputToContain("org #{$org->id} (Phoenix Bar): created default brand #")
            ->assertExitCode(0)
            ->run();

        $defaults = $this->defaultsOf($org->id);
        $this->assertCount(1, $defaults);
        $this->assertSame('phoenix-bar-2', $defaults[0]->slug);
        $this->assertNotSame($deleted, (int) $defaults[0]->id);
    }

    public function test_heal_orphan_rows_creates_the_default_brand_under_the_organisation_it_heals(): void
    {
        $org = $this->orgWithoutBrands('Healing Venue');
        $healthyBefore = $this->brandsOf($this->healthy->id);

        $this->artisan('brands:heal-orphan-rows', ['--org' => (string) $org->id, '--apply' => true])
            ->assertExitCode(0)
            ->run();

        $defaults = $this->defaultsOf($org->id);
        $this->assertCount(1, $defaults);
        $this->assertSame($org->widget_token, $defaults[0]->widget_token);
        $this->assertEquals($healthyBefore, $this->brandsOf($this->healthy->id));
    }

    /** An organisation as the bug left it: created, with no brand at all. */
    private function orgWithoutBrands(string $name): Organization
    {
        $org = Organization::withoutEvents(fn () => OrganizationFactory::new()->create(['name' => $name]));
        $this->assertCount(0, $this->brandsOf($org->id));

        return $org;
    }

    private function insertBrand(int $orgId, string $name, bool $isDefault, ?string $token = null, ?string $slug = null, bool $deleted = false): int
    {
        return (int) DB::table('brands')->insertGetId([
            'organization_id' => $orgId,
            'name'            => $name,
            'slug'            => $slug ?? Str::slug($name) . '-' . Str::lower(Str::random(4)),
            'widget_token'    => $token ?? Str::random(32),
            'is_default'      => $isDefault,
            'sort_order'      => 1,
            'deleted_at'      => $deleted ? now() : null,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    private function brandsOf(int $orgId): Collection
    {
        return DB::table('brands')->where('organization_id', $orgId)->orderBy('id')->get();
    }

    private function defaultsOf(int $orgId): Collection
    {
        return DB::table('brands')
            ->where('organization_id', $orgId)
            ->where('is_default', true)
            ->whereNull('deleted_at')
            ->get();
    }
}
