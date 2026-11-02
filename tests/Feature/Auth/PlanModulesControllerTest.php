<?php

namespace Tests\Feature\Auth;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * Buying HexaTech's workspaces one at a time (owner 2026-11-02): the catalogue the sign-up pages read, the sign-up of
 * a module, and Plan & products — what an organisation holds and adding one more product through billing.
 */
class PlanModulesControllerTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private const SAAS = 'https://saas.test/api';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        config(['services.saas.api_url' => null, 'admin_access.mode' => 'enforce']);
        Http::preventStrayRequests();
        Mail::fake();
        foreach (['trial_end', 'period_end', 'trial_started_at', 'entitlements_synced_at'] as $column) {
            if (!Schema::hasColumn('organizations', $column)) {
                Schema::table('organizations', fn ($t) => $t->timestamp($column)->nullable());
            }
        }
        if (!Schema::hasColumn('users', 'email_verified_at')) {
            Schema::table('users', fn ($t) => $t->timestamp('email_verified_at')->nullable());
        }
        if (!Schema::hasTable('email_verification_codes')) {
            Schema::create('email_verification_codes', function ($t) {
                $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('purpose', 16)->nullable();
                $t->string('email'); $t->string('code', 6); $t->timestamp('expires_at');
                $t->timestamp('verified_at')->nullable(); $t->timestamps();
            });
        }
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function ($t) {
                $t->id(); $t->morphs('tokenable'); $t->string('name'); $t->string('token', 64)->unique();
                $t->text('abilities')->nullable(); $t->timestamp('last_used_at')->nullable();
                $t->timestamp('expires_at')->nullable(); $t->timestamps();
            });
        }
        $this->org->forceFill(['entitled_products' => ['loyalty'], 'plan_slug' => 'loyalty', 'subscription_status' => 'TRIALING',
            'trial_end' => now()->addDays(5), 'saas_org_id' => 'saas-org-1'])->save();
    }

    private function withBilling(array $plans, array $subscriptions, array $bootstrapProducts = ['loyalty', 'content']): void
    {
        config(['services.saas.api_url' => self::SAAS, 'services.saas.jwt_secret' => 'plan-modules-test-secret']);
        Http::fake([
            self::SAAS . '/auth/service-token' => Http::response(['token' => 'jwt-for-org'], 200),
            self::SAAS . '/billing/plans' => Http::response(['plans' => $plans], 200),
            self::SAAS . '/billing/subscriptions' => Http::response(['subscriptions' => $subscriptions], 200),
            self::SAAS . '/billing/change-plan' => Http::response(['subscription' => ['id' => 'sub-1']], 200),
            self::SAAS . '/tools/bootstrap' => Http::response([
                'subscription' => ['status' => 'TRIALING', 'plan' => ['slug' => 'loyalty-content'], 'trialEnd' => now()->addDays(5)->toIso8601String(), 'currentPeriodEnd' => now()->addDays(5)->toIso8601String()],
                'entitled_product_slugs' => $bootstrapProducts,
                'features' => ['campaigns' => 'true'],
            ], 200),
        ]);
    }

    private function plan(string $slug, int $amount, ?string $price = null): array
    {
        return ['id' => "plan-{$slug}", 'slug' => $slug, 'name' => $slug, 'monthlyAmount' => $amount, 'currency' => 'eur',
            'trialDays' => 7, 'isActive' => true, 'monthlyPriceId' => $price];
    }

    private function manager(): static
    {
        return $this->actingAs($this->staff, 'sanctum');
    }

    public function test_the_catalogue_shows_the_built_in_prices_when_there_is_no_billing(): void
    {
        $plans = collect($this->getJson('/api/v1/modules')->assertOk()->json('plans'))->keyBy('slug');

        $this->assertSame(['loyalty', 'content', 'loyalty-content'], $plans->keys()->all());
        $this->assertSame([8500, 'eur', true, 'built_in'], [$plans['loyalty']['monthly_amount'], $plans['loyalty']['currency'], $plans['loyalty']['available'], $plans['loyalty']['source']]);
        $this->assertSame(8500, $plans['content']['monthly_amount']);
        $this->assertSame(17000, $plans['loyalty-content']['monthly_amount']);
    }

    public function test_the_catalogue_shows_what_billing_sells_and_only_module_plans(): void
    {
        $this->withBilling([$this->plan('loyalty', 8900), $this->plan('growth', 26900), $this->plan('content-loyalty', 1)], []);

        $plans = collect($this->getJson('/api/v1/modules')->assertOk()->json('plans'))->keyBy('slug');
        $this->assertSame(['loyalty', 'content', 'loyalty-content'], $plans->keys()->all(), 'no full plan, no non-canonical slug');
        $this->assertSame([8900, true, 'billing'], [$plans['loyalty']['monthly_amount'], $plans['loyalty']['available'], $plans['loyalty']['source']]);
        $this->assertFalse($plans['content']['available'], 'billing was read and does not sell it');
    }

    public function test_the_full_plan_list_leaves_the_module_plans_to_their_own_pages(): void
    {
        $this->withBilling([$this->plan('starter', 14900), $this->plan('loyalty', 8500), $this->plan('loyalty-content', 17000),
            $this->plan('appointments', 4900), $this->plan('content', 8500)], []);

        $this->assertSame(['starter', 'appointments'], collect($this->getJson('/api/v1/plans')->assertOk()->json('plans'))->pluck('slug')->all());
    }

    public function test_plan_and_products_shows_what_the_organisation_holds_and_what_adding_costs(): void
    {
        $state = $this->manager()->getJson('/api/v1/auth/modules')->assertOk()->json();

        $this->assertTrue($state['on_modules']);
        $this->assertSame(['loyalty'], $state['modules']);
        $this->assertSame('loyalty', $state['landing']);
        $this->assertTrue($state['can_manage']);
        $this->assertSame(['slug' => 'loyalty', 'monthly_amount' => 8500, 'currency' => 'eur'], $state['plan']);
        $products = collect($state['products'])->keyBy('key');
        $this->assertTrue($products['loyalty']['held']);
        $this->assertFalse($products['content']['held']);
        $this->assertSame(['loyalty-content', true, 17000, 8500], [$products['content']['plan_slug'], $products['content']['available'], $products['content']['monthly_amount'], $products['content']['extra_monthly_amount']]);
        $this->assertFalse($products['appointments']['available'], 'no built-in price and no billing plan for Appointments with Loyalty');
    }

    public function test_a_full_customer_is_told_its_plan_has_everything(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm', 'loyalty', 'booking', 'chat'], 'plan_slug' => 'growth'])->save();

        $state = $this->manager()->getJson('/api/v1/auth/modules')->assertOk()->json();
        $this->assertFalse($state['on_modules']);
        $this->assertTrue(collect($state['products'])->every(fn ($p) => $p['held'] === true));
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertStatus(422)->assertJsonPath('error', 'not_on_modules');
    }

    public function test_without_billing_adding_a_product_changes_the_organisations_own_plan(): void
    {
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertOk()
            ->assertJsonPath('added', 'content')->assertJsonPath('modules', ['loyalty', 'content']);

        $org = $this->org->fresh();
        $this->assertSame('loyalty-content', $org->plan_slug);
        $this->assertSame(['loyalty', 'content'], $org->entitled_products);
        $this->assertTrue($org->workspaceEnabled('content'));
        $this->assertTrue($org->hasFeature('campaigns'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'plan.module_added']);

        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertStatus(422)->assertJsonPath('error', 'already_held');
    }

    public function test_a_trial_moves_to_the_larger_plan_in_billing(): void
    {
        $this->withBilling([$this->plan('loyalty', 8500), $this->plan('loyalty-content', 17000)],
            [['id' => 'sub-1', 'status' => 'TRIALING', 'stripeSubscriptionId' => null, 'billingInterval' => 'MONTHLY']]);

        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertOk()
            ->assertJsonPath('charged', 'none')->assertJsonPath('modules', ['loyalty', 'content']);

        Http::assertSent(fn (ClientRequest $r) => $r->url() === self::SAAS . '/billing/change-plan'
            && $r['planId'] === 'plan-loyalty-content' && $r['interval'] === 'MONTHLY' && !isset($r['amount']));
        $this->assertSame(['loyalty', 'content'], $this->org->fresh()->entitled_products, 'synced from billing');
    }

    private const PAID = [['id' => 'sub-1', 'status' => 'ACTIVE', 'stripeSubscriptionId' => 'sub_stripe_1', 'billingInterval' => 'MONTHLY']];

    public function test_a_paid_subscription_does_not_move_to_a_plan_stripe_cannot_charge(): void
    {
        $this->withBilling([$this->plan('loyalty', 8500, 'price_l'), $this->plan('loyalty-content', 17000)], self::PAID);
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertStatus(422)->assertJsonPath('error', 'not_available');
        Http::assertNotSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/billing/change-plan'));
        $this->assertSame(['loyalty'], $this->org->fresh()->entitled_products);
    }

    public function test_a_paid_subscription_moves_to_a_plan_with_its_own_price_and_is_prorated(): void
    {
        $this->withBilling([$this->plan('loyalty', 8500, 'price_l'), $this->plan('loyalty-content', 17000, 'price_lc')], self::PAID);
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertOk()->assertJsonPath('charged', 'prorated');
        Http::assertSent(fn (ClientRequest $r) => $r->url() === self::SAAS . '/billing/change-plan' && $r['planId'] === 'plan-loyalty-content');
    }

    public function test_a_product_billing_does_not_sell_cannot_be_added(): void
    {
        $this->withBilling([$this->plan('loyalty', 8500)], [['id' => 'sub-1', 'status' => 'TRIALING']]);
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertStatus(422)->assertJsonPath('error', 'not_available');
        Http::assertNotSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/billing/change-plan'));
    }

    public function test_a_product_cannot_be_added_to_a_plan_that_ended(): void
    {
        $this->withBilling([$this->plan('loyalty-content', 17000)], [['id' => 'sub-1', 'status' => 'CANCELED']]);
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertStatus(422)->assertJsonPath('error', 'subscription_inactive');
        Http::assertNotSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/billing/change-plan'));
        $this->assertSame(['loyalty'], $this->org->fresh()->entitled_products);
    }

    public function test_only_owners_and_managers_add_a_product(): void
    {
        $staff = $this->staffUser($this->org, ['role' => 'staff']);
        $this->actingAs($staff, 'sanctum')->getJson('/api/v1/auth/modules')->assertOk()->assertJsonPath('can_manage', false);
        $this->actingAs($staff, 'sanctum')->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertForbidden()->assertJsonPath('error', 'not_allowed');
        $this->assertSame(['loyalty'], $this->org->fresh()->entitled_products);
    }

    public function test_signing_up_for_loyalty_alone_lands_in_its_workspace(): void
    {
        $response = $this->postJson('/api/v1/auth/trial', ['name' => 'New Owner', 'email' => 'loyalty-owner@example.test', 'phone' => '+12025550123',
            'hotel_name' => 'Loyal Cafe', 'password' => 'NewAccount123!', 'plan' => 'loyalty', 'industry' => 'restaurant'])->assertCreated();

        $response->assertJsonPath('user.workspaces.loyalty', ['landing' => true, 'only' => true]);
        $this->assertArrayNotHasKey('content', $response->json('user.workspaces'));
        $org = Organization::findOrFail(User::findOrFail($response->json('user.id'))->organization_id);
        $this->assertSame(['loyalty'], $org->planModules());
        $this->assertSame('loyalty', $org->plan_slug);
        $this->assertSame('TRIALING', $org->subscription_status);
    }

    public function test_signing_up_for_a_module_billing_does_not_sell_is_refused_before_anything_is_made(): void
    {
        config(['services.saas.api_url' => self::SAAS]);
        Http::fake([self::SAAS . '/billing/plans' => Http::response(['plans' => [$this->plan('loyalty', 8500), $this->plan('growth', 26900)]], 200)]);

        $this->postJson('/api/v1/auth/trial', ['name' => 'New Owner', 'email' => 'content-owner@example.test', 'phone' => '+12025550123',
            'hotel_name' => 'Content Studio', 'password' => 'NewAccount123!', 'plan' => 'content'])
            ->assertStatus(422)->assertJsonPath('error', 'not_available');

        $this->assertDatabaseMissing('users', ['email' => 'content-owner@example.test']);
        Http::assertNotSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/auth/register'));
    }
}
