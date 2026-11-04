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

    private function plan(string $slug, int $amount, ?string $price = null, ?string $yearlyPrice = null, array $features = []): array
    {
        return ['id' => "plan-{$slug}", 'slug' => $slug, 'name' => $slug, 'monthlyAmount' => $amount, 'yearlyAmount' => (int) round($amount * 12 * 0.85),
            'currency' => 'eur', 'trialDays' => 7, 'isActive' => true, 'monthlyPriceId' => $price, 'yearlyPriceId' => $yearlyPrice,
            'planFeatures' => array_map(fn ($k) => ['feature' => ['key' => $k], 'value' => $features[$k]], array_keys($features))];
    }

    private function manager(): static
    {
        return $this->actingAs($this->staff, 'sanctum');
    }

    public function test_the_catalogue_shows_the_built_in_prices_when_there_is_no_billing(): void
    {
        $plans = collect($this->getJson('/api/v1/modules')->assertOk()->json('plans'))->keyBy('slug');

        // Each product in three packages, then every pair of packages: 3 + 3 + 9.
        $this->assertCount(15, $plans);
        $this->assertSame(['loyalty_lite', 'loyalty', 'loyalty_pro', 'content_lite', 'content', 'content_pro'], $plans->keys()->take(6)->all());
        $this->assertSame([8500, 86700, 'eur', true, 'built_in'], [$plans['loyalty']['monthly_amount'], $plans['loyalty']['yearly_amount'], $plans['loyalty']['currency'], $plans['loyalty']['available'], $plans['loyalty']['source']]);
        $this->assertSame([4900, 14900, 3900], [$plans['loyalty_lite']['monthly_amount'], $plans['loyalty_pro']['monthly_amount'], $plans['content_lite']['monthly_amount']]);
        $this->assertSame(17000, $plans['loyalty-content']['monthly_amount']);
        $this->assertSame(['loyalty' => 'pro', 'content' => 'lite'], $plans['loyalty_pro-content_lite']['packages']);
        $this->assertSame('500', $plans['loyalty_lite']['features']['max_loyalty_members']);
        $this->assertSame(15, $this->getJson('/api/v1/modules')->json('yearly_discount_percent'));
    }

    public function test_the_catalogue_shows_what_billing_sells_and_only_module_plans(): void
    {
        $this->withBilling([$this->plan('loyalty', 8900, null, null, ['max_loyalty_members' => '3000']), $this->plan('growth', 26900), $this->plan('content-loyalty', 1)], []);

        $plans = collect($this->getJson('/api/v1/modules')->assertOk()->json('plans'))->keyBy('slug');
        $this->assertCount(15, $plans, 'no full plan, no non-canonical slug');
        $this->assertArrayNotHasKey('growth', $plans->all());
        $this->assertSame([8900, 90780, true, 'billing'], [$plans['loyalty']['monthly_amount'], $plans['loyalty']['yearly_amount'], $plans['loyalty']['available'], $plans['loyalty']['source']]);
        $this->assertSame(['max_loyalty_members' => '3000'], $plans['loyalty']['features'], 'billing\'s features');
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
        $this->assertSame(['loyalty' => 'standard'], $state['packages']);
        $this->assertSame(['loyalty', 8500, 86700, 'eur'], [$state['plan']['slug'], $state['plan']['monthly_amount'], $state['plan']['yearly_amount'], $state['plan']['currency']]);
        $this->assertSame(15, $state['yearly_discount_percent']);
        $products = collect($state['products'])->keyBy('key');
        $this->assertSame([true, 'standard', false], [$products['loyalty']['held'], $products['loyalty']['package'], $products['loyalty']['can_remove']]);
        $change = collect($products['loyalty']['options'])->keyBy('package');
        $this->assertSame(['lite', 'pro'], $change->keys()->all(), 'the other packages');
        $this->assertSame(['loyalty_pro', true, 14900, 6400], [$change['pro']['plan_slug'], $change['pro']['available'], $change['pro']['monthly_amount'], $change['pro']['extra_monthly_amount']]);
        $this->assertSame(-3600, $change['lite']['extra_monthly_amount']);
        $this->assertFalse($products['content']['held']);
        $add = collect($products['content']['options'])->keyBy('package');
        $this->assertSame(['lite', 'standard', 'pro'], $add->keys()->all());
        $this->assertSame(['loyalty-content', true, 17000, 8500], [$add['standard']['plan_slug'], $add['standard']['available'], $add['standard']['monthly_amount'], $add['standard']['extra_monthly_amount']]);
        $this->assertSame(['loyalty-content_lite', 3900], [$add['lite']['plan_slug'], $add['lite']['extra_monthly_amount']]);
        $this->assertFalse($products['appointments']['options'][0]['available'], 'no built-in price and no billing plan for Appointments with Loyalty');
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
            ->assertJsonPath('done', 'added')->assertJsonPath('module', 'content')->assertJsonPath('modules', ['loyalty', 'content']);

        $org = $this->org->fresh();
        $this->assertSame('loyalty-content', $org->plan_slug);
        $this->assertSame(['loyalty', 'content'], $org->entitled_products);
        $this->assertTrue($org->workspaceEnabled('content'));
        $this->assertTrue($org->hasFeature('campaigns'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'plan.module_added']);

        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content'])->assertStatus(422)->assertJsonPath('error', 'already_held');
    }

    public function test_without_billing_a_package_changes_and_a_product_comes_off(): void
    {
        $this->manager()->postJson('/api/v1/auth/modules/add', ['module' => 'content', 'package' => 'lite'])->assertOk();
        $this->assertSame('loyalty-content_lite', $this->org->fresh()->plan_slug);
        $this->assertSame(['loyalty' => 'standard', 'content' => 'lite'], $this->org->fresh()->planTiers());

        $this->manager()->postJson('/api/v1/auth/modules/package', ['module' => 'loyalty', 'package' => 'pro'])->assertOk()
            ->assertJsonPath('done', 'package')->assertJsonPath('packages', ['loyalty' => 'pro', 'content' => 'lite']);
        $this->assertSame('10000', $this->org->fresh()->plan_features['max_loyalty_members']);
        $this->manager()->postJson('/api/v1/auth/modules/package', ['module' => 'loyalty', 'package' => 'pro'])->assertStatus(422)->assertJsonPath('error', 'same_package');
        $this->manager()->postJson('/api/v1/auth/modules/package', ['module' => 'appointments', 'package' => 'pro'])->assertStatus(422)->assertJsonPath('error', 'no_such_package');

        $this->manager()->postJson('/api/v1/auth/modules/remove', ['module' => 'content'])->assertOk()->assertJsonPath('modules', ['loyalty']);
        $org = $this->org->fresh();
        $this->assertSame(['loyalty_pro', ['loyalty']], [$org->plan_slug, $org->entitled_products]);
        $this->assertFalse($org->workspaceEnabled('content'));
        $this->manager()->postJson('/api/v1/auth/modules/remove', ['module' => 'loyalty'])->assertStatus(422)->assertJsonPath('error', 'last_product');
        $this->assertDatabaseHas('audit_logs', ['action' => 'plan.module_removed']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'plan.module_package']);
    }

    public function test_a_smaller_package_is_refused_when_the_organisation_has_more_than_it_allows(): void
    {
        foreach (range(1, 3) as $i) {
            $this->staffUser($this->org, ['role' => 'staff']);
        }
        $this->manager()->postJson('/api/v1/auth/modules/package', ['module' => 'loyalty', 'package' => 'lite'])->assertStatus(422)
            ->assertJsonPath('error', 'over_limit')->assertJsonPath('limit_key', 'max_team_members')->assertJsonPath('limit', 2);
        $this->assertSame('loyalty', $this->org->fresh()->plan_slug);
    }

    public function test_a_trial_on_a_yearly_subscription_changes_package_on_the_yearly_price(): void
    {
        $this->withBilling([$this->plan('loyalty', 8500, 'price_l', 'price_l_y'), $this->plan('loyalty_pro', 14900, 'price_lp', 'price_lp_y', ['max_loyalty_members' => '10000'])],
            [['id' => 'sub-1', 'status' => 'ACTIVE', 'stripeSubscriptionId' => 'sub_stripe_1', 'billingInterval' => 'YEARLY']]);

        $this->manager()->postJson('/api/v1/auth/modules/package', ['module' => 'loyalty', 'package' => 'pro'])->assertOk()->assertJsonPath('charged', 'prorated');
        Http::assertSent(fn (ClientRequest $r) => $r->url() === self::SAAS . '/billing/change-plan' && $r['planId'] === 'plan-loyalty_pro' && $r['interval'] === 'YEARLY');
    }

    public function test_paying_yearly_needs_the_plans_yearly_price(): void
    {
        config(['app.url' => 'https://app.test']);
        $this->withBilling([$this->plan('loyalty', 8500, 'price_l')], [['id' => 'sub-1', 'status' => 'TRIALING']]);
        $this->manager()->postJson('/api/v1/auth/modules/activate', ['interval' => 'YEARLY'])->assertStatus(422)->assertJsonPath('error', 'not_available');
        Http::assertNotSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/billing/activate'));
    }

    public function test_paying_yearly_asks_billing_for_the_yearly_checkout(): void
    {
        config(['app.url' => 'https://app.test']);
        $this->withBilling([$this->plan('loyalty', 8500, 'price_l', 'price_l_y')], [['id' => 'sub-1', 'status' => 'TRIALING']]);
        Http::fake([self::SAAS . '/billing/activate' => Http::response(['checkoutUrl' => 'https://checkout.stripe.test/c/1'], 200)]);

        $this->manager()->postJson('/api/v1/auth/modules/activate', ['interval' => 'YEARLY'])->assertOk()->assertJsonPath('checkoutUrl', 'https://checkout.stripe.test/c/1');
        Http::assertSent(fn (ClientRequest $r) => $r->url() === self::SAAS . '/billing/activate' && $r['interval'] === 'YEARLY' && $r['planSlug'] === 'loyalty'
            && $r['successUrl'] === 'https://app.test/account/products?success=1');
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

    /** 4 Nov 2026: billing's register refused `other` and `services` (422), leaving the trial with no billing record. */
    public function test_an_industry_billing_does_not_know_is_left_out_of_billings_register_and_kept_locally(): void
    {
        config(['services.saas.api_url' => self::SAAS]);
        Http::fake([
            self::SAAS . '/billing/plans' => Http::response(['plans' => [$this->plan('loyalty', 8500)]], 200),
            self::SAAS . '/auth/register' => fn (ClientRequest $r) => in_array($r['industry'] ?? null, [null, 'hotel', 'beauty', 'medical', 'restaurant', 'legal', 'real_estate', 'education', 'fitness', 'hospitality'], true)
                ? Http::response(['token' => 'saas-token', 'organization' => ['id' => 'saas-org-new']], 201)
                : Http::response(['error' => 'Validation failed', 'errors' => ['industry' => ['The selected industry is invalid.']]], 422),
            self::SAAS . '/tools/bootstrap' => Http::response(['subscription' => ['status' => 'TRIALING', 'plan' => ['slug' => 'loyalty']], 'entitled_product_slugs' => ['loyalty']], 200),
        ]);

        foreach (['other' => 'something-else@example.test', 'services' => 'other-services@example.test'] as $industry => $email) {
            $response = $this->postJson('/api/v1/auth/trial', ['name' => 'New Owner', 'email' => $email, 'phone' => '+44 7700 900123',
                'hotel_name' => "Studio {$industry}", 'password' => 'NewAccount123!', 'plan' => 'loyalty', 'industry' => $industry])->assertCreated();

            $org = Organization::findOrFail(User::findOrFail($response->json('user.id'))->organization_id);
            $this->assertSame('saas-org-new', $org->saas_org_id, "the {$industry} trial has its billing record");
            $this->assertSame($industry, $org->industry);
        }
        Http::assertSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/auth/register') && array_key_exists('industry', $r->data()) && $r['industry'] === null);
    }

    public function test_an_industry_billing_knows_is_still_sent_to_it(): void
    {
        config(['services.saas.api_url' => self::SAAS]);
        Http::fake([
            self::SAAS . '/billing/plans' => Http::response(['plans' => [$this->plan('loyalty', 8500)]], 200),
            self::SAAS . '/auth/register' => Http::response(['token' => 'saas-token', 'organization' => ['id' => 'saas-org-spa']], 201),
            self::SAAS . '/tools/bootstrap' => Http::response(['subscription' => ['status' => 'TRIALING', 'plan' => ['slug' => 'loyalty']], 'entitled_product_slugs' => ['loyalty']], 200),
        ]);

        $this->postJson('/api/v1/auth/trial', ['name' => 'New Owner', 'email' => 'spa-owner@example.test', 'phone' => '+44 7700 900123',
            'hotel_name' => 'Seaside Spa', 'password' => 'NewAccount123!', 'plan' => 'loyalty', 'industry' => 'beauty'])->assertCreated();

        Http::assertSent(fn (ClientRequest $r) => str_ends_with($r->url(), '/auth/register') && $r['industry'] === 'beauty' && $r['planSlug'] === 'loyalty');
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
