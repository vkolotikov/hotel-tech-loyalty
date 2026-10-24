<?php

namespace Tests\Feature\Console;

use App\Models\Brand;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * A new organisation always gets its own default brand, whatever tenant is bound (release 6, spec 2026-10-23 §2
 * item 1), and `php artisan brands:ensure-default` repairs one that has none. The SQLite schema is given production's
 * `brands_org_default_unique` and `brands_org_slug_unique`, so a brand written for the wrong organisation fails here as
 * it does on PostgreSQL.
 */
class DefaultBrandTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        if (DB::getDriverName() === 'sqlite') {
            if (!Schema::hasIndex('brands', 'brands_org_default_unique')) {
                DB::statement('CREATE UNIQUE INDEX brands_org_default_unique ON brands (organization_id) WHERE is_default = 1 AND deleted_at IS NULL');
            }
            if (!Schema::hasIndex('brands', 'brands_org_slug_unique')) {
                DB::statement('CREATE UNIQUE INDEX brands_org_slug_unique ON brands (organization_id, slug)');
            }
        }
    }

    /** @return \Illuminate\Support\Collection<int, Brand> every brand of the organisation, deleted ones too */
    private function brandsOf(int $orgId)
    {
        return Brand::withoutGlobalScopes()->where('organization_id', $orgId)->orderBy('id')->get();
    }

    private function defaultsOf(int $orgId): int
    {
        return Brand::withoutGlobalScopes()->where('organization_id', $orgId)->where('is_default', true)->whereNull('deleted_at')->count();
    }

    /** An organisation created while none is bound, then stripped of its brands (as one created before release 6 could be). */
    private function withoutBrand(string $name): Organization
    {
        $prior = app('current_organization_id');
        app()->forgetInstance('current_organization_id');
        $org = Organization::create(['name' => $name, 'slug' => 'nb-' . uniqid('', true), 'industry' => 'beauty']);
        app()->instance('current_organization_id', $prior);
        DB::table('brands')->where('organization_id', $org->id)->delete();

        return $org;
    }

    /** A brand of another organisation, written with that organisation bound (Brand's hook stamps the bound one). */
    private function brandFor(Organization $org, array $attributes): Brand
    {
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $org->id);
        try {
            return Brand::create($attributes);
        } finally {
            app()->instance('current_organization_id', $prior);
        }
    }

    public function test_an_organisation_created_while_another_is_bound_gets_exactly_one_default_brand_of_its_own(): void
    {
        $ours = $this->brandsOf($this->org->id)->map->only(['id', 'organization_id', 'is_default', 'name'])->all();
        $this->assertSame((int) $this->org->id, (int) app('current_organization_id'));

        $new = Organization::create(['name' => 'Second Venue', 'slug' => 'second-' . uniqid('', true), 'industry' => 'beauty', 'widget_token' => 'second-venue-widget-token-fixture']);

        $brands = $this->brandsOf($new->id);
        $this->assertCount(1, $brands);
        $this->assertSame(['Second Venue', 'second-venue', 'second-venue-widget-token-fixture', true, (int) $new->id],
            [$brands[0]->name, $brands[0]->slug, $brands[0]->widget_token, (bool) $brands[0]->is_default, (int) $brands[0]->organization_id]);
        // The bound organisation is untouched, and still bound.
        $this->assertSame($ours, $this->brandsOf($this->org->id)->map->only(['id', 'organization_id', 'is_default', 'name'])->all());
        $this->assertSame(1, $this->defaultsOf($this->org->id));
        $this->assertSame((int) $this->org->id, (int) app('current_organization_id'));
    }

    public function test_with_no_organisation_bound_it_is_as_before(): void
    {
        foreach (['unbound' => fn () => app()->forgetInstance('current_organization_id'), 'bound to nobody' => fn () => app()->instance('current_organization_id', null)] as $case => $unbind) {
            $unbind();
            $new = Organization::create(['name' => "Venue {$case}", 'slug' => 'v-' . uniqid('', true), 'industry' => 'beauty']);

            $brands = $this->brandsOf($new->id);
            $this->assertCount(1, $brands, $case);
            $this->assertSame(["Venue {$case}", true, (string) $new->widget_token], [$brands[0]->name, (bool) $brands[0]->is_default, (string) $brands[0]->widget_token], $case);
            $this->assertFalse(app()->bound('current_organization_id'), "{$case}: the binding is put back as it was");
        }
        app()->instance('current_organization_id', $this->org->id);
        $this->assertSame(1, $this->defaultsOf($this->org->id));
    }

    public function test_the_dry_run_lists_what_it_would_do_and_writes_nothing(): void
    {
        $bare = $this->withoutBrand('Bare Studio');
        $other = $this->withoutBrand('Other Studio');
        $this->brandFor($other, ['name' => 'Only Brand', 'slug' => 'only-brand', 'is_default' => false]);
        $before = Brand::withoutGlobalScopes()->count();

        $this->artisan('brands:ensure-default')
            ->expectsOutputToContain("would create brand 'Bare Studio' as the default")
            ->expectsOutputToContain("'Only Brand' the default")
            ->expectsOutputToContain('Nothing was written; run again with --apply to write.')
            ->assertExitCode(0);

        $this->assertSame($before, Brand::withoutGlobalScopes()->count());
        $this->assertSame([0, 0], [$this->defaultsOf($bare->id), $this->defaultsOf($other->id)]);
    }

    public function test_apply_gives_each_one_a_default_and_a_second_apply_changes_nothing(): void
    {
        $bare = $this->withoutBrand('Bare Studio');
        // A deleted brand still holds its slug (brands_org_slug_unique counts it) and the organisation's widget token.
        $this->brandFor($bare, ['name' => 'Bare Studio', 'slug' => 'bare-studio', 'widget_token' => (string) $bare->widget_token, 'is_default' => true])->delete();
        $other = $this->withoutBrand('Other Studio');
        $first = $this->brandFor($other, ['name' => 'First Brand', 'slug' => 'first-brand', 'is_default' => false]);
        $this->brandFor($other, ['name' => 'Later Brand', 'slug' => 'later-brand', 'is_default' => false]);
        $ours = $this->brandsOf($this->org->id)->map->only(['id', 'is_default'])->all();

        $this->artisan('brands:ensure-default --apply')
            ->expectsOutputToContain("'Bare Studio' as the default")
            ->expectsOutputToContain("made brand #{$first->id} 'First Brand' the default")
            ->assertExitCode(0);

        $created = Brand::withoutGlobalScopes()->where('organization_id', $bare->id)->whereNull('deleted_at')->get();
        $this->assertCount(1, $created);
        $this->assertSame(['Bare Studio', 'bare-studio-2', true], [$created[0]->name, $created[0]->slug, (bool) $created[0]->is_default]);
        $this->assertNotSame((string) $bare->widget_token, (string) $created[0]->widget_token, 'a token another brand holds is not reused');
        $this->assertSame(32, strlen((string) $created[0]->widget_token));
        $this->assertSame([$first->id], Brand::withoutGlobalScopes()->where('organization_id', $other->id)->where('is_default', true)->pluck('id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(2, $this->brandsOf($other->id)->count(), 'promoted, not added');
        $this->assertSame($ours, $this->brandsOf($this->org->id)->map->only(['id', 'is_default'])->all());

        $count = Brand::withoutGlobalScopes()->count();
        $this->artisan('brands:ensure-default --apply')->expectsOutputToContain('Every organisation has a default brand. Nothing to do.')->assertExitCode(0);
        $this->assertSame($count, Brand::withoutGlobalScopes()->count());
    }

    public function test_one_organisation_by_its_id_and_an_unknown_id_is_refused(): void
    {
        $bare = $this->withoutBrand('Bare Studio');
        $alsoBare = $this->withoutBrand('Also Bare');

        $this->artisan("brands:ensure-default --org={$bare->id} --apply")->expectsOutputToContain("'Bare Studio' as the default")->assertExitCode(0);
        $this->assertSame([1, 0], [$this->defaultsOf($bare->id), $this->defaultsOf($alsoBare->id)]);
        $this->artisan("brands:ensure-default --org={$bare->id}")->expectsOutputToContain("Organisation {$bare->id} has a default brand. Nothing to do.")->assertExitCode(0);

        $this->artisan('brands:ensure-default --org=999999999 --apply')->expectsOutputToContain('No organisation has that id.')->assertExitCode(1);
        $this->artisan('brands:ensure-default --org=abc')->assertExitCode(1);
        $this->assertSame(0, $this->defaultsOf($alsoBare->id));
    }
}
