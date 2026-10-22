<?php

namespace Tests\Feature\Branding;

use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Organization's `created` hook gives the NEW organisation its default
 * brand, whatever tenant is bound when it runs.
 *
 * Found 2026-10-23 running the suites against PostgreSQL. Brand carries
 * BelongsToOrganization, whose `creating` hook forces organization_id from
 * the bound tenant, and the hook's "already has a default?" check went
 * through TenantScope. Creating organisation B while A was bound (a super
 * admin creating a venue from inside their own, a console command run under
 * a tenant, a test making a second organisation) therefore wrote B's default
 * brand for A. PostgreSQL refused it on `brands_org_default_unique`, the
 * hook logged a warning, and B was left with no default brand.
 *
 * The brands table carries production's unique indexes (setUpBrandsSchema),
 * so SQLite refuses what PostgreSQL refuses. Every read here is a plain
 * query builder read, so no model scope decides what an assertion sees.
 */
class DefaultBrandOnCreateTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBrandsSchema();
    }

    public function test_an_organisation_created_while_another_is_bound_gets_its_own_default_brand(): void
    {
        $bound = OrganizationFactory::new()->create(['name' => 'Bound Venue']);
        $boundBrands = $this->brandsOf($bound->id);
        $this->assertCount(1, $boundBrands);
        app()->instance('current_organization_id', $bound->id);

        $new = OrganizationFactory::new()->create(['name' => 'New Venue']);

        $defaults = $this->defaultsOf($new->id);
        $this->assertCount(1, $defaults);
        $this->assertSame('New Venue', $defaults[0]->name);
        $this->assertSame('new-venue', $defaults[0]->slug);
        $this->assertSame($new->widget_token, $defaults[0]->widget_token);
        $this->assertCount(1, $this->brandsOf($new->id));

        // The bound organisation still has exactly the brand it had.
        $this->assertEquals($boundBrands, $this->brandsOf($bound->id));
        // And it is still the bound tenant.
        $this->assertSame($bound->id, app('current_organization_id'));
    }

    public function test_an_organisation_created_with_no_tenant_bound_gets_its_default_brand_as_before(): void
    {
        // The application's own state outside a tenant request: nothing
        // bound (AppServiceProvider, which would bind null, is not listed in
        // bootstrap/providers.php).
        $this->assertFalse(app()->bound('current_organization_id'));

        $org = OrganizationFactory::new()->create(['name' => 'Quiet Spa']);

        $brands = $this->brandsOf($org->id);
        $this->assertCount(1, $brands);
        $this->assertTrue((bool) $brands[0]->is_default);
        $this->assertNull($brands[0]->deleted_at);
        $this->assertSame('Quiet Spa', $brands[0]->name);
        $this->assertSame('quiet-spa', $brands[0]->slug);
        $this->assertSame($org->widget_token, $brands[0]->widget_token);
        $this->assertSame(0, (int) $brands[0]->sort_order);

        // No binding is left behind.
        $this->assertFalse(app()->bound('current_organization_id'));
    }

    public function test_a_second_organisation_created_under_a_tenant_does_not_disturb_a_third(): void
    {
        $first = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $first->id);

        $second = OrganizationFactory::new()->create();
        $third  = OrganizationFactory::new()->create();

        foreach ([$first, $second, $third] as $org) {
            $this->assertCount(1, $this->defaultsOf($org->id), "org #{$org->id} has exactly one default brand");
            $this->assertCount(1, $this->brandsOf($org->id), "org #{$org->id} has no other brand");
        }
    }

    public function test_a_default_brand_that_cannot_be_written_leaves_the_caller_and_its_transaction_working(): void
    {
        $bound = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $bound->id);

        // Another brand already carries the token the new organisation's
        // default would take (brands.widget_token is unique).
        $taken = Str::random(32);
        DB::table('brands')->insert([
            'organization_id' => $bound->id, 'name' => 'Second', 'slug' => 'second',
            'widget_token' => $taken, 'is_default' => false, 'sort_order' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        Log::spy();

        $new = DB::transaction(function () use ($taken) {
            $org = OrganizationFactory::new()->create(['widget_token' => $taken]);

            // On PostgreSQL a refused INSERT aborts the enclosing transaction
            // unless the writer ran in its own savepoint; this read and the
            // commit would then fail (SQLSTATE 25P02).
            $this->assertSame(1, DB::table('organizations')->where('id', $org->id)->count());

            return $org;
        });

        $this->assertSame(1, DB::table('organizations')->where('id', $new->id)->count());
        $this->assertCount(0, $this->brandsOf($new->id));
        $this->assertCount(2, $this->brandsOf($bound->id));
        $this->assertSame($bound->id, app('current_organization_id'));
        Log::shouldHaveReceived('warning')
            ->withArgs(fn ($message, $context = []) => str_contains($message, 'default brand creation failed')
                && ($context['org_id'] ?? null) === $new->id)
            ->once();
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
