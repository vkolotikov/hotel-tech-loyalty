<?php

namespace Tests\Feature\BrandCreation;

use App\Exceptions\FeatureNotEntitled;
use App\Http\Controllers\Api\V1\Admin\BrandController;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class BrandCreationTest extends TestCase
{
    use SetsUpMinimalSchema;

    private array $locks = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpKnowledgeSchema();
        app()->instance('current_organization_id', 19);

        // SQLite cannot prove concurrency. Enforce PostgreSQL's two-int
        // signature here; a separate two-connection PostgreSQL check covers
        // the real lock lifetime and isolation between organizations.
        DB::connection()->beforeExecuting(function ($query, $bindings) {
            if (str_contains($query, 'pg_advisory_xact_lock')) {
                // Inspect bindings before SQLite's UDF converts them to int32.
                $this->assertGreaterThanOrEqual(-2147483648, $bindings[0]);
                $this->assertLessThanOrEqual(2147483647, $bindings[0]);
            }
        });
        DB::connection()->getPdo()->sqliteCreateFunction('pg_advisory_xact_lock', function ($namespace, $orgId) {
            $this->assertGreaterThan(0, DB::transactionLevel());
            $this->locks[] = [$namespace, $orgId];

            return null;
        }, 2);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        parent::tearDown();
    }

    public function test_a_single_brand_plan_can_create_its_first_brand_with_a_valid_lock_key(): void
    {
        // Another tenant's brands must not count against this tenant's limit.
        DB::table('brands')->insert(['organization_id' => 20, 'name' => 'Other organization']);

        $response = app(BrandController::class)->store($this->request());

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame(19, $response->getData()->organization_id);
        $this->assertCount(1, $this->locks);
        $this->assertSame(19, $this->locks[0][1]);
        $this->assertSame(1, Brand::count());
        $this->assertSame(0, DB::transactionLevel());
    }

    public function test_an_existing_brand_keeps_the_single_brand_plan_gate(): void
    {
        Brand::create(['name' => 'Existing brand']);

        try {
            app(BrandController::class)->store($this->request());
            $this->fail('A second brand must require the brands entitlement.');
        } catch (FeatureNotEntitled $e) {
            $this->assertSame('brands', $e->feature);
            $this->assertSame('starter', $e->planSlug);
        }

        $this->assertCount(1, $this->locks);
        $this->assertSame(1, Brand::withTrashed()->count());
        $this->assertSame(0, DB::transactionLevel());
    }

    public function test_a_deleted_brand_still_counts_against_the_single_brand_limit(): void
    {
        Brand::create(['name' => 'Deleted brand'])->delete();

        try {
            app(BrandController::class)->store($this->request());
            $this->fail('Deleting a brand must not bypass the plan limit.');
        } catch (FeatureNotEntitled $e) {
            $this->assertSame('brands', $e->feature);
        }

        $this->assertSame(0, Brand::count());
        $this->assertSame(1, Brand::withTrashed()->count());
        $this->assertSame(0, DB::transactionLevel());
    }

    public function test_a_multibrand_plan_can_still_create_an_additional_brand(): void
    {
        Brand::create(['name' => 'Existing brand']);

        $response = app(BrandController::class)->store($this->request(multibrand: true));

        $this->assertSame(201, $response->getStatusCode());
        $this->assertSame(2, Brand::count());
        $this->assertSame([], $this->locks);
    }

    private function request(bool $multibrand = false): Request
    {
        $org = (new Organization)->forceFill([
            'id' => 19, 'plan_slug' => $multibrand ? 'enterprise' : 'starter',
            'plan_features' => ['brands' => $multibrand],
        ]);
        $user = (new User)->forceFill(['id' => 62, 'organization_id' => 19, 'user_type' => 'staff']);
        $user->setRelation('organization', $org);
        $request = Request::create('/api/v1/admin/brands', 'POST', ['name' => 'New brand']);
        $request->setUserResolver(fn () => $user);

        return $request;
    }
}
