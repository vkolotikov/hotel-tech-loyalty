<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\SaasAuthMiddleware;
use App\Http\Middleware\TenantMiddleware;
use App\Models\Organization;
use App\Models\User;
use App\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Reflector;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * A route parameter that names a model (`{inquiry}`, `{pipeline}`, `{task}`, `{field}`…) is looked up by
 * SubstituteBindings through the model's TenantScope, which finds nothing until TenantMiddleware has set the
 * organisation (it fails closed). Laravel sorted SubstituteBindings first, so every such admin route answered 404
 * ("This item no longer exists") for the organisation's own rows: the inquiry page, an inquiry's activities,
 * pipelines, tasks, reservations, company accounts, venues, saved views, custom fields. bootstrap/app.php now runs
 * SaasAuthMiddleware and TenantMiddleware, in that order, before the bindings.
 */
class RouteBindingTenantTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        // The admin routes' brand middleware reads `brands` and `brand_user`.
        $this->setUpLoyaltySchema();
        $this->setUpCustomFieldsSchema();
        if (!Schema::hasTable('brand_user')) {
            Schema::create('brand_user', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('brand_id');
                $table->unsignedBigInteger('user_id');
                $table->timestamps();
            });
        }
        if (!Schema::hasTable('staff')) {
            Schema::create('staff', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->default('staff');
                $table->string('hotel_name')->nullable();
                $table->string('department')->nullable();
                $table->text('allowed_nav_groups')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $key) {
            if (app()->bound($key)) {
                app()->forgetInstance($key);
            }
        }
        parent::tearDown();
    }

    public function test_every_route_with_the_organisation_resolves_its_bindings_after_it(): void
    {
        $router = app(Router::class);
        $checked = 0;
        foreach ($router->getRoutes() as $route) {
            $names = array_map(fn ($m) => is_string($m) ? explode(':', $m, 2)[0] : get_class($m), $router->gatherRouteMiddleware($route));
            $tenant = array_search(TenantMiddleware::class, $names, true);
            $bindings = array_search(SubstituteBindings::class, $names, true);
            if ($tenant === false || $bindings === false) {
                continue;
            }
            $checked++;
            $this->assertLessThan($bindings, $tenant, $route->uri() . ': the organisation must be set before the route-model bindings');
            $saas = array_search(SaasAuthMiddleware::class, $names, true);
            if ($saas !== false) {
                $this->assertLessThan($tenant, $saas, $route->uri() . ': the SaaS sign-in names the organisation TenantMiddleware chooses');
            }
        }
        $this->assertGreaterThan(100, $checked);
    }

    /** A route that binds an organisation's model must have the organisation at all (1 Nov 2026: 36 such parameters). */
    public function test_every_route_binding_a_tenant_model_sets_the_organisation(): void
    {
        $router = app(Router::class);
        $bound = 0;
        foreach ($router->getRoutes() as $route) {
            foreach ($route->signatureParameters(['subClass' => Model::class]) as $parameter) {
                $class = Reflector::getParameterClassName($parameter);
                if (!in_array($parameter->getName(), $route->parameterNames(), true)
                    || !array_key_exists(TenantScope::class, (new $class)->getGlobalScopes())) {
                    continue;
                }
                $bound++;
                $names = array_map(fn ($m) => is_string($m) ? explode(':', $m, 2)[0] : get_class($m), $router->gatherRouteMiddleware($route));
                $this->assertContains(TenantMiddleware::class, $names,
                    "{$route->uri()}: {$class} is found through TenantScope, which finds nothing without the organisation");
            }
        }
        $this->assertGreaterThanOrEqual(30, $bound);
    }

    public function test_a_bound_admin_route_finds_the_organisations_own_row_and_never_another_organisations(): void
    {
        [$user, $org] = $this->staffUser('Riverside Studio');
        [, $otherOrg] = $this->staffUser('Harbour Hotel');
        $own = $this->field($org->id, 'own_field');
        $foreign = $this->field($otherOrg->id, 'foreign_field');

        Sanctum::actingAs($user);

        $this->deleteJson("/api/v1/admin/custom-fields/{$foreign}")->assertNotFound();
        $this->assertTrue(DB::table('custom_fields')->where('id', $foreign)->exists());

        $this->deleteJson("/api/v1/admin/custom-fields/{$own}")->assertOk()->assertJson(['success' => true]);
        $this->assertFalse(DB::table('custom_fields')->where('id', $own)->exists());
    }

    /** @return array{0: User, 1: Organization} */
    private function staffUser(string $name): array
    {
        $org = Organization::create(['name' => $name, 'slug' => 'org-' . uniqid(), 'subscription_status' => 'ACTIVE']);
        $user = User::create([
            'organization_id' => $org->id,
            'name'            => $name . ' Admin',
            'email'           => 'staff_' . uniqid('', true) . '@example.test',
            'password'        => 'irrelevant-Password-1',
            'user_type'       => 'staff',
        ]);
        DB::table('staff')->insert([
            'organization_id' => $org->id,
            'user_id'         => $user->id,
            'role'            => 'manager',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        return [$user, $org];
    }

    private function field(int $orgId, string $key): int
    {
        return (int) DB::table('custom_fields')->insertGetId([
            'organization_id' => $orgId,
            'entity'          => 'inquiry',
            'key'             => $key,
            'label'           => ucfirst(str_replace('_', ' ', $key)),
            'type'            => 'text',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }
}
