<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\Billing\SaasBilling;
use App\Support\AdminAccess\AccessMap;
use App\Support\PlanModules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Buying HexaTech's workspaces one at a time (owner, 2026-11-02): Loyalty and Content at 85 € a month each, the
 * Appointments plan beside them (App\Support\PlanModules).
 *
 *   GET  /v1/modules                  public: the module plans and their prices, for the sign-up pages
 *   GET  /v1/auth/modules             this organisation's modules, what it may add and for how much
 *   POST /v1/auth/modules/add         add one product: the subscription moves to the plan of the larger set
 *   POST /v1/auth/modules/activate    pay for the plan (Stripe Checkout), or start it again once it ended
 *   POST /v1/auth/modules/portal      Stripe's customer portal: card, invoices, cancelling
 *   POST /v1/auth/modules/refresh     read billing again (after Stripe sends the customer back)
 *
 * The /auth routes run `admin.access` under the AccessMap key `auth/modules` (product `account`, changes manager), so
 * an organisation on modules reaches them while the full admin's Billing (`auth/billing`, product `admin`) stays the
 * full customers'. Prices, plans and the subscription are billing's; this controller only picks the plan whose slug
 * names the set of modules (PlanModules::planSlug) and never sends an amount.
 */
class PlanModulesController extends Controller
{
    public function __construct(private readonly SaasBilling $billing)
    {
    }

    /** GET /v1/modules — the module plans billing sells, with the built-in prices where it cannot be read. */
    public function catalogue(): JsonResponse
    {
        return response()->json(['plans' => array_values($this->catalogueRows($this->billingPlans(null)))]);
    }

    /** GET /v1/auth/modules — what this organisation holds and may add. */
    public function show(Request $request): JsonResponse
    {
        $org = $this->org($request);
        if (!$org) {
            return response()->json(['error' => 'no_organization', 'message' => 'Your account has no organisation.'], 422);
        }

        return response()->json($this->state($request, $org));
    }

    /** POST /v1/auth/modules/add {module} — add one product to an organisation on modules. */
    public function add(Request $request): JsonResponse
    {
        $validated = $request->validate(['module' => 'required|string|in:' . implode(',', PlanModules::all())]);
        $module = $validated['module'];
        $org = $this->org($request);
        if (!$org) {
            return $this->refuse('no_organization', 'Your account has no organisation.');
        }
        $held = $org->planModules();
        if ($held === null) {
            return $this->refuse('not_on_modules', 'Your plan already includes every product.');
        }
        if (in_array($module, $held, true)) {
            return $this->refuse('already_held', 'Your plan already includes this product.');
        }
        $target = PlanModules::normalise([...$held, $module]);
        $targetSlug = PlanModules::planSlug($target);
        $fromSlug = (string) $org->plan_slug;

        // No billing application (local development only): the organisation's own row is the plan.
        if (!config('services.saas.api_url')) {
            $org->forceFill([
                'plan_slug'         => $targetSlug,
                'entitled_products' => PlanModules::products($target),
                'plan_features'     => PlanModules::features($target),
                'entitlements_synced_at' => now(),
            ])->save();
            $this->audit($request, $org, $module, $fromSlug, $targetSlug, 'local');

            return response()->json(['added' => $module, 'charged' => 'none'] + $this->state($request, $org->fresh()));
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
        $plan = $plans[$targetSlug] ?? null;
        if (!$plan) {
            return $this->refuse('not_available', 'This product cannot be added online yet. Contact HexaTech and we will add it for you.');
        }
        $active = $this->activeSubscription($subscriptions);
        if (!$active) {
            return $this->refuse('subscription_inactive', 'Your plan is not active. Start it again first, then add the product.');
        }
        // A subscription Stripe charges moves to the new plan's price; without one, Stripe would keep charging the old.
        $paid = !empty($active['stripeSubscriptionId']);
        if ($paid && empty($plan['monthlyPriceId'])) {
            return $this->refuse('not_available', 'This product cannot be added online yet. Contact HexaTech and we will add it for you.');
        }

        try {
            $response = Http::withToken($token)->timeout(15)->post($this->api('/billing/change-plan'), [
                'planId'   => $plan['id'],
                'interval' => 'MONTHLY',
            ]);
        } catch (\Throwable $e) {
            report($e);

            return $this->unreachable();
        }
        if (!$response->successful()) {
            report(new \RuntimeException('SaaS change-plan [' . $response->status() . ']: ' . substr($response->body(), 0, 300)));

            return $this->refuse('billing_refused', 'Billing could not add the product. Nothing was charged. Please try again or contact HexaTech.', 502);
        }

        $this->billing->syncEntitlementsFromSaas($request, $token);
        $this->forgetCachedStatus($org);
        $this->audit($request, $org, $module, $fromSlug, $targetSlug, $paid ? 'prorated' : 'trial');

        return response()->json(['added' => $module, 'charged' => $paid ? 'prorated' : 'none'] + $this->state($request, $org->fresh()));
    }

    /** POST /v1/auth/modules/activate — pay for the current module plan through Stripe Checkout, or start it again. */
    public function activate(Request $request): JsonResponse
    {
        $org = $this->org($request);
        $held = $org?->planModules();
        if (!$org || $held === null) {
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
        $slug = PlanModules::planSlug($held);
        $plan = $plans[$slug] ?? null;
        if (!$plan) {
            return $this->refuse('not_available', 'Your plan cannot be paid for online yet. Contact HexaTech.');
        }

        try {
            if ($this->activeSubscription($subscriptions)) {
                // The trial or plan becomes paid: billing makes the Checkout session for this plan's own price.
                $response = Http::withToken($token)->timeout(15)->post($this->api('/billing/activate'), [
                    'interval'   => 'MONTHLY',
                    'planSlug'   => $slug,
                    'successUrl' => "{$returnTo}/account/products?success=1",
                    'cancelUrl'  => "{$returnTo}/account/products?canceled=1",
                ]);
            } else {
                // Ended: as the full admin's Billing does, a new subscription to the same plan (billing decides its terms).
                $response = Http::withToken($token)->timeout(15)->post($this->api('/billing/subscribe'), [
                    'planId'   => $plan['id'],
                    'interval' => 'MONTHLY',
                ]);
            }
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

    // ─── What the Plan & products page shows ──────────────────────

    /** @return array<string, mixed> */
    private function state(Request $request, Organization $org): array
    {
        $held = $org->planModules();
        $staff = Staff::where('user_id', $request->user()->id)->where('is_active', true)->first();
        $canManage = $request->user()->isPlatformAdmin() || in_array($staff?->role, AccessMap::MANAGER_ROLES, true);
        $billingConfigured = (bool) config('services.saas.api_url');
        $plans = $this->catalogueRows($held === null ? [] : $this->billingPlans(null));
        $current = $held === null ? null : ($plans[PlanModules::planSlug($held)] ?? null);

        $status = $org->subscription_status;
        if ($status === 'TRIALING' && $org->trial_end && $org->trial_end->isPast()) {
            $status = 'EXPIRED';
        }

        $products = [];
        foreach (PlanModules::all() as $module) {
            $row = ['key' => $module, 'held' => $held === null || in_array($module, $held, true)];
            if ($held !== null && !$row['held']) {
                $target = $plans[PlanModules::planSlug([...$held, $module])] ?? null;
                $row['plan_slug'] = PlanModules::planSlug([...$held, $module]);
                $row['available'] = (bool) ($target['available'] ?? false);
                $row['monthly_amount'] = $target['monthly_amount'] ?? null;
                $row['extra_monthly_amount'] = isset($target['monthly_amount'], $current['monthly_amount'])
                    ? $target['monthly_amount'] - $current['monthly_amount'] : null;
                $row['currency'] = $target['currency'] ?? PlanModules::FALLBACK_CURRENCY;
            }
            $products[] = $row;
        }

        return [
            'organization' => ['name' => $org->name],
            'on_modules'   => $held !== null,
            'modules'      => $held ?? PlanModules::all(),
            'landing'      => $held === null ? null : collect($held)->first(fn (string $m) => $org->workspace($m)['landing']),
            'plan'         => $current ? ['slug' => $current['slug'], 'monthly_amount' => $current['monthly_amount'], 'currency' => $current['currency']] : null,
            'subscription' => [
                'status'    => $status,
                'active'    => in_array($status, ['ACTIVE', 'TRIALING'], true),
                'plan_slug' => $org->plan_slug,
                'trial_end' => $org->trial_end?->toIso8601String(),
                'period_end' => $org->period_end?->toIso8601String(),
            ],
            'products'     => $products,
            'can_manage'   => $canManage,
            'billing_available' => $billingConfigured,
        ];
    }

    /**
     * Every module plan, by slug: billing's rows where it lists them, the built-in price for the modules sold alone and
     * their sets where it does not. `available` is false only for a plan billing was read for and does not list.
     *
     * @param  array<string, array<string, mixed>>|null  $billing  null when billing could not be read (or is not configured)
     * @return array<string, array{slug: string, modules: list<string>, monthly_amount: ?int, currency: string, trial_days: int, available: bool, source: string}>
     */
    private function catalogueRows(?array $billing): array
    {
        $rows = [];
        foreach ($billing ?? [] as $slug => $plan) {
            $rows[$slug] = [
                'slug'           => $slug,
                'modules'        => PlanModules::fromPlanSlug($slug) ?? [],
                'monthly_amount' => isset($plan['monthlyAmount']) ? (int) $plan['monthlyAmount'] : null,
                'currency'       => strtolower((string) ($plan['currency'] ?? PlanModules::FALLBACK_CURRENCY)),
                'trial_days'     => (int) ($plan['trialDays'] ?? PlanModules::FALLBACK_TRIAL_DAYS),
                'available'      => true,
                'source'         => 'billing',
            ];
        }
        $sets = array_map(fn (string $m) => [$m], PlanModules::SOLD_ALONE);
        $sets[] = PlanModules::SOLD_ALONE;
        foreach ($sets as $set) {
            $slug = PlanModules::planSlug($set);
            $rows[$slug] ??= [
                'slug'           => $slug,
                'modules'        => PlanModules::normalise($set),
                'monthly_amount' => PlanModules::fallbackMonthlyAmount($set),
                'currency'       => PlanModules::FALLBACK_CURRENCY,
                'trial_days'     => PlanModules::FALLBACK_TRIAL_DAYS,
                // Billing read and silent about it: not sold yet. Not configured or not reachable: the local trial path serves it.
                'available'      => $billing === null,
                'source'         => 'built_in',
            ];
        }
        // Fewer modules first, then in PlanModules order (loyalty, content, loyalty-content).
        $rank = fn (string $slug) => [count(explode('-', $slug)), array_map(fn (string $m) => array_search($m, PlanModules::all(), true), explode('-', $slug))];
        uksort($rows, fn (string $a, string $b) => $rank($a) <=> $rank($b));

        return $rows;
    }

    /**
     * Billing's public module plans by slug, or null when billing is not configured or could not be read. With a
     * token the authenticated listing (which carries each plan's Stripe price id); without, the public one.
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

    private function audit(Request $request, Organization $org, string $module, string $from, string $to, string $charged): void
    {
        try {
            AuditLog::record('plan.module_added', $org, ['module' => $module, 'plan' => $to, 'charged' => $charged], ['plan' => $from], $request->user(),
                "Added {$module} to the plan ({$from} → {$to})");
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
