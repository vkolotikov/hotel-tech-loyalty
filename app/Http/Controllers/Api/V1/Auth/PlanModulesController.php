<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\Billing\SaasBilling;
use App\Services\PlanLimitGuard;
use App\Support\AdminAccess\AccessMap;
use App\Support\PlanModules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Buying HexaTech's workspaces one at a time (owner, 2026-11-02): Loyalty and Content, each in three packages (Lite,
 * Standard at 85 € a month, Pro), 15 % less a month paid yearly, the Appointments plan beside them
 * (App\Support\PlanModules).
 *
 *   GET  /v1/modules                  public: every module plan, its monthly and yearly price and what it grants
 *   GET  /v1/auth/modules             this organisation's products and packages, and what each change would cost
 *   POST /v1/auth/modules/add         add one product {module, package}
 *   POST /v1/auth/modules/package     move one product to another package {module, package}
 *   POST /v1/auth/modules/remove      take one product off a plan of two {module}
 *   POST /v1/auth/modules/activate    pay for the plan through Stripe Checkout {interval}, or start it again
 *   POST /v1/auth/modules/portal      Stripe's customer portal: card, invoices, cancelling
 *   POST /v1/auth/modules/refresh     read billing again (after Stripe sends the customer back)
 *
 * Every change moves the subscription to the plan of the new choice of packages (PlanModules::planSlug) through
 * billing's change-plan, which Stripe prorates. The /auth routes run `admin.access` under the AccessMap key
 * `auth/modules` (product `account`, changes managers'). Prices, plans and the subscription are billing's; the client
 * names a product and a package, never an amount.
 */
class PlanModulesController extends Controller
{
    /** Limits a smaller package may not go below what the organisation already has. */
    private const KEPT_LIMITS = [PlanLimitGuard::KEY_MEMBERS, PlanLimitGuard::KEY_TEAM];

    public function __construct(private readonly SaasBilling $billing)
    {
    }

    /** GET /v1/modules — the module plans billing sells, with the built-in prices where it cannot be read. */
    public function catalogue(): JsonResponse
    {
        return response()->json([
            'plans' => array_values($this->catalogueRows($this->billingPlans(null))),
            'yearly_discount_percent' => PlanModules::YEARLY_DISCOUNT_PERCENT,
        ]);
    }

    /** GET /v1/auth/modules — what this organisation holds and may change. */
    public function show(Request $request): JsonResponse
    {
        $org = $this->org($request);
        if (!$org) {
            return $this->refuse('no_organization', 'Your account has no organisation.');
        }

        return response()->json($this->state($request, $org));
    }

    /** POST /v1/auth/modules/add {module, package?} — add one product to an organisation on modules. */
    public function add(Request $request): JsonResponse
    {
        [$module, $package] = $this->choice($request, true);
        $org = $this->org($request);
        $current = $org?->planModules() === null ? null : $org->planTiers();
        if (!$org || $current === null) {
            return $this->refuse('not_on_modules', 'Your plan already includes every product.');
        }
        if (isset($current[$module])) {
            return $this->refuse('already_held', 'Your plan already includes this product.');
        }

        return $this->move($request, $org, $current, PlanModules::selection([...$current, $module => $package]), 'added', $module);
    }

    /** POST /v1/auth/modules/package {module, package} — move one product to another package. */
    public function package(Request $request): JsonResponse
    {
        [$module, $package] = $this->choice($request, false);
        $org = $this->org($request);
        $current = $org?->planModules() === null ? null : $org->planTiers();
        if (!$org || $current === null) {
            return $this->refuse('not_on_modules', 'Your plan is managed in the full admin\'s Billing page.');
        }
        if (!isset($current[$module])) {
            return $this->refuse('not_held', 'Your plan does not include this product. Add it first.');
        }
        if ($current[$module] === $package) {
            return $this->refuse('same_package', 'Your plan already has this package.');
        }

        return $this->move($request, $org, $current, PlanModules::selection([...$current, $module => $package]), 'package', $module);
    }

    /** POST /v1/auth/modules/remove {module} — take one product off a plan that has another. */
    public function remove(Request $request): JsonResponse
    {
        $module = $request->validate(['module' => 'required|string|in:' . implode(',', PlanModules::all())])['module'];
        $org = $this->org($request);
        $current = $org?->planModules() === null ? null : $org->planTiers();
        if (!$org || $current === null) {
            return $this->refuse('not_on_modules', 'Your plan is managed in the full admin\'s Billing page.');
        }
        if (!isset($current[$module])) {
            return $this->refuse('not_held', 'Your plan does not include this product.');
        }
        if (count($current) < 2) {
            return $this->refuse('last_product', 'This is the only product on your plan. To stop it, cancel the plan under Card and invoices.');
        }
        unset($current[$module]);
        $target = $current;
        $current = $org->planTiers();

        return $this->move($request, $org, $current, $target, 'removed', $module);
    }

    /** POST /v1/auth/modules/activate {interval?} — pay for the current module plan, monthly or yearly, or start it again. */
    public function activate(Request $request): JsonResponse
    {
        $interval = $request->validate(['interval' => 'nullable|string|in:MONTHLY,YEARLY'])['interval'] ?? 'MONTHLY';
        $org = $this->org($request);
        if (!$org || $org->planModules() === null) {
            return $this->refuse('not_on_modules', 'Your plan is managed in the full admin\'s Billing page.');
        }
        if (!config('services.saas.api_url')) {
            return $this->refuse('billing_not_configured', 'Billing is not configured here.', 400);
        }
        $returnTo = $this->billing->resolveLoyaltyUrl();
        if (!$returnTo) {
            return $this->refuse('billing_not_configured', 'This application\'s address (APP_URL) is not configured.', 500);
        }
        $token = $this->billing->ensureSaasOrg($request);
        $plans = $token ? $this->billingPlans($token) : null;
        $subscriptions = $token ? $this->billingSubscriptions($token) : null;
        if ($plans === null || $subscriptions === null) {
            return $this->unreachable();
        }
        $slug = PlanModules::planSlug($org->planTiers());
        $plan = $plans[$slug] ?? null;
        if (!$plan || empty($plan[$interval === 'YEARLY' ? 'yearlyPriceId' : 'monthlyPriceId'])) {
            return $this->refuse('not_available', $interval === 'YEARLY'
                ? 'Your plan cannot be paid yearly online yet. Choose monthly, or contact HexaTech.'
                : 'Your plan cannot be paid for online yet. Contact HexaTech.');
        }

        try {
            $response = $this->activeSubscription($subscriptions)
                // The trial or plan becomes paid: billing makes the Checkout session for this plan's own price.
                ? Http::withToken($token)->timeout(15)->post($this->api('/billing/activate'), [
                    'interval'   => $interval,
                    'planSlug'   => $slug,
                    'successUrl' => "{$returnTo}/account/products?success=1",
                    'cancelUrl'  => "{$returnTo}/account/products?canceled=1",
                ])
                // Ended: as the full admin's Billing does, a new subscription to the same plan (billing decides its terms).
                : Http::withToken($token)->timeout(15)->post($this->api('/billing/subscribe'), [
                    'planId'   => $plan['id'],
                    'interval' => $interval,
                ]);
        } catch (\Throwable $e) {
            report($e);

            return $this->unreachable();
        }
        if (!$response->successful()) {
            return $this->refuse('billing_refused', (string) ($response->json('error') ?? 'Billing could not start the payment.'), 502);
        }
        if ($url = $response->json('checkoutUrl')) {
            return response()->json(['checkoutUrl' => $url]);
        }
        $this->billing->syncEntitlementsFromSaas($request, $token);
        $this->forgetCachedStatus($org);

        return response()->json(['started' => true] + $this->state($request, $org->fresh()));
    }

    /** POST /v1/auth/modules/portal — Stripe's customer portal, back to Plan & products. */
    public function portal(Request $request): JsonResponse
    {
        $org = $this->org($request);
        if (!$org || $org->planModules() === null) {
            return $this->refuse('not_on_modules', 'Your plan is managed in the full admin\'s Billing page.');
        }
        $returnTo = $this->billing->resolveLoyaltyUrl();
        $token = config('services.saas.api_url') ? $this->billing->ensureSaasOrg($request) : null;
        if (!$token || !$returnTo) {
            return $this->unreachable();
        }
        try {
            $response = Http::withToken($token)->timeout(10)->post($this->api('/billing/portal'), [
                'returnUrl' => "{$returnTo}/account/products",
            ]);
        } catch (\Throwable $e) {
            report($e);

            return $this->unreachable();
        }
        if (!$response->successful() || !$response->json('portalUrl')) {
            return $this->refuse('billing_refused', 'The card and invoices page is not available right now.', 502);
        }

        return response()->json(['portalUrl' => $response->json('portalUrl')]);
    }

    /** POST /v1/auth/modules/refresh — read billing again, e.g. after Stripe sends the customer back. */
    public function refresh(Request $request): JsonResponse
    {
        $org = $this->org($request);
        if (!$org) {
            return $this->refuse('no_organization', 'Your account has no organisation.');
        }
        $token = config('services.saas.api_url') ? $this->billing->getSaasToken($request) : null;
        if ($token) {
            $this->billing->syncEntitlementsFromSaas($request, $token);
            $this->forgetCachedStatus($org);
        }

        return response()->json($this->state($request, $org->fresh()));
    }

    // ─── Moving the subscription ──────────────────────────────────

    /**
     * Moves the organisation from $current to $target (module => package) through billing's change-plan.
     *
     * @param  array<string, string>  $current
     * @param  array<string, string>  $target
     */
    private function move(Request $request, Organization $org, array $current, array $target, string $action, string $module): JsonResponse
    {
        $fromSlug = PlanModules::planSlug($current);
        $toSlug = PlanModules::planSlug($target);

        // No billing application (local development only): the organisation's own row is the plan.
        if (!config('services.saas.api_url')) {
            if ($refusal = $this->limitRefusal($org, PlanModules::features($target))) {
                return $refusal;
            }
            $org->forceFill([
                'plan_slug'              => $toSlug,
                'entitled_products'      => PlanModules::products($target),
                'plan_features'          => PlanModules::features($target),
                'entitlements_synced_at' => now(),
            ])->save();
            $this->audit($request, $org, $action, $module, $fromSlug, $toSlug, 'local');

            return response()->json(['done' => $action, 'module' => $module, 'charged' => 'none'] + $this->state($request, $org->fresh()));
        }

        $token = $this->billing->ensureSaasOrg($request);
        if (!$token) {
            return $this->unreachable();
        }
        $plans = $this->billingPlans($token);
        $subscriptions = $this->billingSubscriptions($token);
        if ($plans === null || $subscriptions === null) {
            return $this->unreachable();
        }
        $plan = $plans[$toSlug] ?? null;
        if (!$plan) {
            return $this->refuse('not_available', 'This change cannot be made online yet. Contact HexaTech and we will make it for you.');
        }
        $active = $this->activeSubscription($subscriptions);
        if (!$active) {
            return $this->refuse('subscription_inactive', 'Your plan is not active. Start it again first, then change it.');
        }
        $interval = ($active['billingInterval'] ?? 'MONTHLY') === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
        // A subscription Stripe charges moves to the new plan's own price for its interval; without one, Stripe would keep charging the old.
        $paid = !empty($active['stripeSubscriptionId']);
        if ($paid && empty($plan[$interval === 'YEARLY' ? 'yearlyPriceId' : 'monthlyPriceId'])) {
            return $this->refuse('not_available', 'This change cannot be made online yet. Contact HexaTech and we will make it for you.');
        }
        if ($refusal = $this->limitRefusal($org, $this->planFeatures($plan) ?: PlanModules::features($target))) {
            return $refusal;
        }

        try {
            $response = Http::withToken($token)->timeout(15)->post($this->api('/billing/change-plan'), [
                'planId'   => $plan['id'],
                'interval' => $interval,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return $this->unreachable();
        }
        if (!$response->successful()) {
            report(new \RuntimeException('SaaS change-plan [' . $response->status() . ']: ' . substr($response->body(), 0, 300)));

            return $this->refuse('billing_refused', 'Billing could not make the change. Nothing was charged. Please try again or contact HexaTech.', 502);
        }

        $this->billing->syncEntitlementsFromSaas($request, $token);
        $this->forgetCachedStatus($org);
        // Stripe prorates only a subscription it is charging; one still in its trial pays the new price from the first invoice.
        $charged = $paid && ($active['status'] ?? '') === 'ACTIVE' ? 'prorated' : 'none';
        $this->audit($request, $org, $action, $module, $fromSlug, $toSlug, $charged === 'prorated' ? 'prorated' : 'trial');

        return response()->json(['done' => $action, 'module' => $module, 'charged' => $charged] + $this->state($request, $org->fresh()));
    }

    /**
     * A smaller package may not hold less than the organisation already has: more members or active staff than its
     * limit is refused, with the numbers, before billing is asked.
     *
     * @param  array<string, mixed>  $features
     */
    private function limitRefusal(Organization $org, array $features): ?JsonResponse
    {
        $previous = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $org->id);
        try {
            foreach (self::KEPT_LIMITS as $key) {
                $limit = self::limit($features[$key] ?? null);
                $count = app(PlanLimitGuard::class)->usage($key)['count'];
                if ($limit !== null && $count > $limit) {
                    $what = $key === PlanLimitGuard::KEY_MEMBERS ? 'members' : 'active team members';

                    return response()->json([
                        'error' => 'over_limit', 'limit_key' => $key, 'limit' => $limit, 'count' => $count,
                        'message' => "This package allows {$limit} {$what} and you have {$count}. Choose a larger package, or remove some first.",
                    ], 422);
                }
            }
        } finally {
            $previous === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $previous);
        }

        return null;
    }

    /** A plan limit as PlanLimitGuard reads it: a positive whole number, or null for no limit. */
    private static function limit(mixed $raw): ?int
    {
        $s = strtolower(trim((string) $raw));

        return ctype_digit($s) && (int) $s > 0 ? (int) $s : null;
    }

    // ─── What the Plan & products page shows ──────────────────────

    /** @return array<string, mixed> */
    private function state(Request $request, Organization $org): array
    {
        $held = $org->planModules();
        $current = $held === null ? [] : $org->planTiers();
        $staff = Staff::where('user_id', $request->user()->id)->where('is_active', true)->first();
        $canManage = $request->user()->isPlatformAdmin() || in_array($staff?->role, AccessMap::MANAGER_ROLES, true);
        $plans = $held === null ? [] : $this->catalogueRows($this->billingPlans(null));
        $plan = $held === null ? null : ($plans[PlanModules::planSlug($current)] ?? null);

        $status = $org->subscription_status;
        if ($status === 'TRIALING' && $org->trial_end && $org->trial_end->isPast()) {
            $status = 'EXPIRED';
        }

        $products = [];
        foreach (PlanModules::all() as $module) {
            $row = ['key' => $module, 'held' => $held === null || isset($current[$module])];
            if ($held !== null) {
                $row['package'] = $current[$module] ?? null;
                $row['can_remove'] = $row['held'] && count($current) > 1;
                $row['options'] = [];
                foreach (PlanModules::tiers($module) as $package) {
                    if ($row['held'] && $package === $current[$module]) {
                        continue;
                    }
                    $target = $plans[PlanModules::planSlug([...$current, $module => $package])] ?? null;
                    $row['options'][] = [
                        'package'              => $package,
                        'plan_slug'            => PlanModules::planSlug([...$current, $module => $package]),
                        'available'            => (bool) ($target['available'] ?? false),
                        'monthly_amount'       => $target['monthly_amount'] ?? null,
                        'yearly_amount'        => $target['yearly_amount'] ?? null,
                        'extra_monthly_amount' => isset($target['monthly_amount'], $plan['monthly_amount']) ? $target['monthly_amount'] - $plan['monthly_amount'] : null,
                        'currency'             => $target['currency'] ?? PlanModules::FALLBACK_CURRENCY,
                        'features'             => $target['features'] ?? [],
                    ];
                }
            }
            $products[] = $row;
        }

        return [
            'organization' => ['name' => $org->name],
            'on_modules'   => $held !== null,
            'modules'      => $held ?? PlanModules::all(),
            'packages'     => (object) $current,
            'landing'      => $held === null ? null : collect($held)->first(fn (string $m) => $org->workspace($m)['landing']),
            'plan'         => $plan ? [
                'slug' => $plan['slug'], 'monthly_amount' => $plan['monthly_amount'], 'yearly_amount' => $plan['yearly_amount'],
                'currency' => $plan['currency'], 'features' => $plan['features'],
            ] : null,
            'subscription' => [
                'status'     => $status,
                'active'     => in_array($status, ['ACTIVE', 'TRIALING'], true),
                'plan_slug'  => $org->plan_slug,
                'trial_end'  => $org->trial_end?->toIso8601String(),
                'period_end' => $org->period_end?->toIso8601String(),
            ],
            'products'     => $products,
            'can_manage'   => $canManage,
            'billing_available' => (bool) config('services.saas.api_url'),
            'yearly_discount_percent' => PlanModules::YEARLY_DISCOUNT_PERCENT,
        ];
    }

    /**
     * Every module plan, by slug: billing's rows where it lists them, the built-in prices for every choice of packages
     * of the modules sold alone where it does not. `available` is false only for a plan billing was read for and does
     * not list.
     *
     * @param  array<string, array<string, mixed>>|null  $billing  null when billing could not be read (or is not configured)
     * @return array<string, array<string, mixed>>
     */
    private function catalogueRows(?array $billing): array
    {
        $rows = [];
        foreach ($billing ?? [] as $slug => $plan) {
            $selection = PlanModules::selectionFromPlanSlug($slug) ?? [];
            $monthly = isset($plan['monthlyAmount']) ? (int) $plan['monthlyAmount'] : null;
            $yearly = isset($plan['yearlyAmount']) && (int) $plan['yearlyAmount'] > 0 ? (int) $plan['yearlyAmount'] : null;
            $rows[$slug] = [
                'slug'           => $slug,
                'modules'        => array_keys($selection),
                'packages'       => (object) $selection,
                'monthly_amount' => $monthly,
                'yearly_amount'  => $yearly,
                'currency'       => strtolower((string) ($plan['currency'] ?? PlanModules::FALLBACK_CURRENCY)),
                'trial_days'     => (int) ($plan['trialDays'] ?? PlanModules::FALLBACK_TRIAL_DAYS),
                'features'       => $this->planFeatures($plan) ?: PlanModules::features($selection),
                'available'      => true,
                'source'         => 'billing',
            ];
        }
        foreach (self::soldAloneChoices() as $selection) {
            $slug = PlanModules::planSlug($selection);
            $monthly = PlanModules::fallbackMonthlyAmount($selection);
            $rows[$slug] ??= [
                'slug'           => $slug,
                'modules'        => array_keys($selection),
                'packages'       => (object) $selection,
                'monthly_amount' => $monthly,
                'yearly_amount'  => $monthly === null ? null : PlanModules::yearlyAmount($monthly),
                'currency'       => PlanModules::FALLBACK_CURRENCY,
                'trial_days'     => PlanModules::FALLBACK_TRIAL_DAYS,
                'features'       => PlanModules::features($selection),
                // Billing read and silent about it: not sold yet. Not configured or not reachable: the local trial path serves it.
                'available'      => $billing === null,
                'source'         => 'built_in',
            ];
        }
        // One product before two; within that, MODULES order, then cheapest package first.
        $rank = function (array $row): array {
            $key = [count($row['modules'])];
            foreach ((array) $row['packages'] as $module => $package) {
                $key[] = array_search($module, PlanModules::all(), true);
                $key[] = array_search($package, PlanModules::TIERS, true);
            }

            return $key;
        };
        uasort($rows, fn (array $a, array $b) => $rank($a) <=> $rank($b));

        return $rows;
    }

    /**
     * Every choice of packages of the modules sold alone: each product in each package, then both together.
     *
     * @return list<array<string, string>>
     */
    private static function soldAloneChoices(): array
    {
        $choices = [[]];
        $out = [];
        foreach (PlanModules::SOLD_ALONE as $module) {
            $next = [];
            foreach ($choices as $choice) {
                $next[] = $choice;
                foreach (PlanModules::tiers($module) as $package) {
                    $next[] = $choice + [$module => $package];
                }
            }
            $choices = $next;
        }
        foreach ($choices as $choice) {
            if ($choice !== []) {
                $out[] = PlanModules::selection($choice);
            }
        }

        return $out;
    }

    /**
     * A billing plan's features as key => value, from the listing's planFeatures.
     *
     * @param  array<string, mixed>  $plan
     * @return array<string, string>
     */
    private function planFeatures(array $plan): array
    {
        $out = [];
        foreach ((array) ($plan['planFeatures'] ?? []) as $row) {
            $key = is_array($row) ? ($row['feature']['key'] ?? null) : null;
            if (is_string($key)) {
                $out[$key] = (string) ($row['value'] ?? '');
            }
        }
        ksort($out);

        return $out;
    }

    /**
     * Billing's public module plans by slug, or null when billing is not configured or could not be read. With a
     * token the authenticated listing; without, the public one.
     *
     * @return array<string, array<string, mixed>>|null
     */
    private function billingPlans(?string $token): ?array
    {
        if (!config('services.saas.api_url')) {
            return null;
        }
        try {
            $request = $token ? Http::withToken($token) : Http::acceptJson();
            $response = $request->timeout(5)->get($this->api('/billing/plans'));
        } catch (\Throwable $e) {
            return null;
        }
        if (!$response->successful()) {
            return null;
        }
        $out = [];
        foreach ((array) $response->json('plans', []) as $plan) {
            $slug = is_array($plan) ? ($plan['slug'] ?? null) : null;
            if (is_string($slug) && PlanModules::fromPlanSlug($slug) !== null && ($plan['isActive'] ?? true) !== false) {
                $out[$slug] = $plan;
            }
        }

        return $out;
    }

    /** @return list<array<string, mixed>>|null */
    private function billingSubscriptions(string $token): ?array
    {
        try {
            $response = Http::withToken($token)->timeout(5)->get($this->api('/billing/subscriptions'));
        } catch (\Throwable $e) {
            return null;
        }

        return $response->successful() ? array_values((array) $response->json('subscriptions', [])) : null;
    }

    /**
     * @param  list<array<string, mixed>>  $subscriptions
     * @return array<string, mixed>|null
     */
    private function activeSubscription(array $subscriptions): ?array
    {
        foreach ($subscriptions as $sub) {
            if (in_array($sub['status'] ?? '', ['ACTIVE', 'TRIALING'], true)) {
                return $sub;
            }
        }

        return null;
    }

    /** @return array{0: string, 1: string} The module and package a request names; package Standard when it names none and $defaulted. */
    private function choice(Request $request, bool $defaulted): array
    {
        $validated = $request->validate([
            'module'  => 'required|string|in:' . implode(',', PlanModules::all()),
            'package' => ($defaulted ? 'nullable' : 'required') . '|string|in:' . implode(',', PlanModules::TIERS),
        ]);
        $module = $validated['module'];
        $package = $validated['package'] ?? PlanModules::DEFAULT_TIER;
        if (!PlanModules::hasTier($module, $package)) {
            abort(response()->json(['error' => 'no_such_package', 'message' => 'This product is not sold in that package.'], 422));
        }

        return [$module, $package];
    }

    private function org(Request $request): ?Organization
    {
        $id = $request->user()?->organization_id;

        return $id ? Organization::find($id) : null;
    }

    private function api(string $path): string
    {
        return rtrim((string) config('services.saas.api_url'), '/') . $path;
    }

    private function forgetCachedStatus(Organization $org): void
    {
        if ($org->saas_org_id) {
            Cache::forget("subscription_status:{$org->saas_org_id}");
        }
    }

    private function audit(Request $request, Organization $org, string $action, string $module, string $from, string $to, string $charged): void
    {
        try {
            AuditLog::record("plan.module_{$action}", $org, ['module' => $module, 'plan' => $to, 'charged' => $charged], ['plan' => $from], $request->user(),
                ucfirst($action) . " {$module} ({$from} → {$to})");
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function refuse(string $code, string $message, int $status = 422): JsonResponse
    {
        return response()->json(['error' => $code, 'message' => $message], $status);
    }

    private function unreachable(): JsonResponse
    {
        return $this->refuse('billing_unreachable', 'Billing cannot be reached right now. Nothing was changed. Please try again in a minute.', 503);
    }
}
