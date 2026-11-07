<?php

namespace App\Support;

/**
 * The workspaces an organisation may buy on their own (owner, 2026-11-02): HexaTech Loyalty and HexaTech Content,
 * each in three packages — Lite, Standard (85 € a month) and Pro — and, since 2026-11-04, HexaTech Appointments in the
 * same three packages at Loyalty's prices (the Appointments plan of Part C, 2026-10-02, is its Standard), and since
 * 2026-11-07 HexaTech CRM (the AI chat widget, the inbox and the CRM in one workspace) at the same prices.
 * Paid yearly, every package costs 15 % less a month (owner, 2026-11-02). A customer starts with one product and
 * adds the others later, or moves to another package.
 *
 * Billing has one plan for each choice of packages, named by planSlug(): a product's Standard package is its bare
 * name, the others carry their package (`loyalty`, `loyalty_lite`, `loyalty_pro`), and two products join with a hyphen
 * in MODULES order (`loyalty-content`, `loyalty_pro-content_lite`, `content-crm_lite`). Billing sells each product
 * alone and every pair, never three. Adding a product or changing a package moves the
 * subscription to that plan (SubscriptionService::changePlan in the billing application), so Stripe prorates the one
 * price.
 *
 * Who is on modules (Organization::planModules()): billing's products are module products only and name at least one
 * module; a product outside them (the full suite's crm and chat, education, avatar) makes a full customer — HexaTech
 * CRM's own product is `crm_chat` for that reason. With no products, the plan slug.
 * Which package of a product an organisation has is its plan slug's (Organization::planTiers()).
 *
 * Prices and features here are only what the pages show when billing cannot be read; billing's plan rows are what is
 * charged and granted.
 */
final class PlanModules
{
    /** The packages, cheapest first. */
    public const TIERS = ['lite', 'standard', 'pro'];

    public const DEFAULT_TIER = 'standard';

    /** Paid yearly, a package costs this much less a month (owner, 2026-11-02). */
    public const YEARLY_DISCOUNT_PERCENT = 15;

    /**
     * Every module, in the one order used for plan slugs, for where staff land and for every list people see. A
     * module's key is also its workspace (`/loyalty`…) and the AccessMap product its staff may reach. Each names the
     * billing products its plan holds (the first is the one that says the module is there) and, per package, its
     * monthly price in cents and what it grants, both used only when billing cannot be read. Appointments' packages
     * (owner 2026-11-04: "same prices, you can make your own packages") differ by how many people can be booked
     * (`max_booking_staff`, PlanLimitGuard::KEY_BOOKING_STAFF) and how many sign in (`max_team_members`).
     */
    public const MODULES = [
        'appointments' => [
            'products' => ['appointments', 'booking'],
            'tiers' => [
                'lite' => ['monthly_amount' => 4900, 'features' => [
                    'max_team_members' => '2', 'max_booking_staff' => '2', 'max_guests' => '1000', 'max_properties' => '1',
                    'max_loyalty_members' => '0',
                ]],
                'standard' => ['monthly_amount' => 8500, 'features' => [
                    'max_team_members' => '5', 'max_booking_staff' => '5', 'max_guests' => '5000', 'max_properties' => '1',
                    'max_loyalty_members' => '0',
                ]],
                'pro' => ['monthly_amount' => 14900, 'features' => [
                    'max_team_members' => '15', 'max_booking_staff' => '15', 'max_guests' => '20000', 'max_properties' => '3',
                    'max_loyalty_members' => '0', 'priority_support' => 'priority',
                ]],
            ],
        ],
        'loyalty' => [
            'products' => ['loyalty'],
            'tiers' => [
                'lite' => ['monthly_amount' => 4900, 'features' => [
                    'max_team_members' => '2', 'max_guests' => '1000', 'max_properties' => '1', 'max_loyalty_members' => '500',
                    'mobile_app' => 'true',
                ]],
                'standard' => ['monthly_amount' => 8500, 'features' => [
                    'max_team_members' => '5', 'max_guests' => '5000', 'max_properties' => '1', 'max_loyalty_members' => '2500',
                    'mobile_app' => 'true', 'push_notifications' => 'true', 'campaigns' => 'true', 'wallet' => 'true',
                    'nfc_cards' => 'true',
                ]],
                'pro' => ['monthly_amount' => 14900, 'features' => [
                    'max_team_members' => '15', 'max_guests' => '20000', 'max_properties' => '3', 'max_loyalty_members' => '10000',
                    'mobile_app' => 'true', 'push_notifications' => 'true', 'campaigns' => 'true', 'wallet' => 'true',
                    'nfc_cards' => 'true', 'priority_support' => 'priority',
                ]],
            ],
        ],
        'content' => [
            'products' => ['content'],
            'tiers' => [
                // ai_monthly_cost_cents: the monthly AI budget ContentAiGate enforces (USD cents, AiUsageService).
                'lite' => ['monthly_amount' => 3900, 'features' => [
                    'max_team_members' => '2', 'max_guests' => '1000', 'max_properties' => '1', 'max_loyalty_members' => '0',
                    'ai_monthly_cost_cents' => '800',
                ]],
                'standard' => ['monthly_amount' => 8500, 'features' => [
                    'max_team_members' => '5', 'max_guests' => '1000', 'max_properties' => '1', 'max_loyalty_members' => '0',
                    'ai_monthly_cost_cents' => '2000',
                ]],
                'pro' => ['monthly_amount' => 14900, 'features' => [
                    'max_team_members' => '15', 'max_guests' => '1000', 'max_properties' => '3', 'max_loyalty_members' => '0',
                    'ai_monthly_cost_cents' => '5000', 'priority_support' => 'priority',
                ]],
            ],
        ],
        // HexaTech CRM (owner 2026-11-07: "AI chat widget + CRM … one portal … sold separately as a module"): the website
        // chat widget with its AI assistant and the live inbox, beside leads, the pipeline, contacts and tasks. Its billing
        // product is `crm_chat`, never the full suite's `crm` or `chat`: Starter (`crm`, `loyalty`) and Growth hold those,
        // and naming them here would make every such full customer an organisation on modules (fromProducts). Its
        // packages differ by team and the AI allowance the chatbot and the inbox's drafts spend
        // (`ai_monthly_cost_cents`, AiUsageService::budgetStatus, which the widget already stops at).
        'crm' => [
            'name' => 'HexaTech CRM',
            'products' => ['crm_chat'],
            'tiers' => [
                'lite' => ['monthly_amount' => 4900, 'features' => [
                    'max_team_members' => '2', 'max_guests' => '1000', 'max_properties' => '1', 'max_loyalty_members' => '0',
                    'chatbot' => 'true', 'engagement' => 'true', 'ai_monthly_cost_cents' => '1000',
                ]],
                'standard' => ['monthly_amount' => 8500, 'features' => [
                    'max_team_members' => '5', 'max_guests' => '5000', 'max_properties' => '1', 'max_loyalty_members' => '0',
                    'chatbot' => 'true', 'engagement' => 'true', 'ai_monthly_cost_cents' => '2500',
                ]],
                'pro' => ['monthly_amount' => 14900, 'features' => [
                    'max_team_members' => '15', 'max_guests' => '20000', 'max_properties' => '3', 'max_loyalty_members' => '0',
                    'chatbot' => 'true', 'engagement' => 'true', 'ai_monthly_cost_cents' => '6000',
                    'priority_support' => 'priority',
                ]],
            ],
        ],
    ];

    /** The modules sold through their own sign-up pages (/appointments/register, /loyalty/register, /content/register, /crm/register). */
    public const SOLD_ALONE = ['appointments', 'loyalty', 'content', 'crm'];

    /** The currency and free trial of the modules' plans when billing cannot be read. */
    public const FALLBACK_CURRENCY = 'eur';

    public const FALLBACK_TRIAL_DAYS = 7;

    /** Every switch a plan carries, off unless a package turns it on. */
    private const SWITCHES = [
        'ai_insights', 'custom_branding', 'push_notifications', 'mobile_app', 'time_management', 'admin_ai', 'brands',
        'landing_pages', 'campaigns', 'reviews', 'engagement', 'wallet', 'chatbot', 'nfc_cards',
    ];

    /** Support levels, lowest first: a set of packages gets the highest of its packages'. */
    private const SUPPORT = ['email', 'priority'];

    /** @return list<string> */
    public static function all(): array
    {
        return array_keys(self::MODULES);
    }

    public static function exists(string $module): bool
    {
        return isset(self::MODULES[$module]);
    }

    /** A module's product name: "HexaTech Loyalty", "HexaTech CRM". */
    public static function name(string $module): string
    {
        return self::MODULES[$module]['name'] ?? 'HexaTech ' . ucfirst($module);
    }

    /**
     * The packages a module is sold in, cheapest first.
     *
     * @return list<string>
     */
    public static function tiers(string $module): array
    {
        return array_values(array_filter(self::TIERS, fn (string $t) => isset(self::MODULES[$module]['tiers'][$t])));
    }

    public static function hasTier(string $module, string $tier): bool
    {
        return isset(self::MODULES[$module]['tiers'][$tier]);
    }

    /**
     * Known modules once each, in MODULES order.
     *
     * @param  iterable<mixed>  $modules
     * @return list<string>
     */
    public static function normalise(iterable $modules): array
    {
        return array_keys(self::selection($modules));
    }

    /**
     * A choice of packages, module => package, in MODULES order. Takes a list of modules (each at Standard) or a map
     * of module => package; unknown modules are dropped and an unknown package reads as Standard.
     *
     * @param  iterable<mixed>  $choice
     * @return array<string, string>
     */
    public static function selection(iterable $choice): array
    {
        $given = [];
        foreach ($choice as $key => $value) {
            if (is_int($key) && is_string($value)) {
                $given[$value] ??= self::DEFAULT_TIER;
            } elseif (is_string($key)) {
                $given[$key] = is_string($value) ? $value : self::DEFAULT_TIER;
            }
        }
        $out = [];
        foreach (self::all() as $module) {
            if (isset($given[$module])) {
                $out[$module] = self::hasTier($module, $given[$module]) ? $given[$module] : self::DEFAULT_TIER;
            }
        }

        return $out;
    }

    /**
     * The modules billing's product list stands for, or null when it is a full customer's (or names no module).
     *
     * @param  array<mixed>  $products
     * @return list<string>|null
     */
    public static function fromProducts(array $products): ?array
    {
        $allowed = array_merge(...array_map(fn (array $m) => $m['products'], array_values(self::MODULES)));
        foreach ($products as $product) {
            if (!in_array($product, $allowed, true)) {
                return null;
            }
        }
        $held = array_filter(self::all(), fn (string $m) => in_array(self::MODULES[$m]['products'][0], $products, true));

        return $held === [] ? null : array_values($held);
    }

    /**
     * The packages a plan slug names (`loyalty`, `loyalty_pro-content_lite`…), or null for any other plan. Only the
     * canonical spelling counts: MODULES order, each module once, Standard spelt as the bare name.
     *
     * @return array<string, string>|null
     */
    public static function selectionFromPlanSlug(?string $slug): ?array
    {
        if (!is_string($slug) || $slug === '') {
            return null;
        }
        $out = [];
        foreach (explode('-', $slug) as $part) {
            [$module, $tier] = array_pad(explode('_', $part, 2), 2, null);
            if (!self::exists($module) || isset($out[$module])
                || ($tier !== null && ($tier === self::DEFAULT_TIER || !self::hasTier($module, $tier)))) {
                return null;
            }
            $out[$module] = $tier ?? self::DEFAULT_TIER;
        }
        if (!self::hasTier(array_key_first($out), $out[array_key_first($out)])) {
            return null;
        }

        return array_keys($out) === array_keys(self::selection($out)) ? $out : null;
    }

    /**
     * The modules a plan slug names, or null for any other plan.
     *
     * @return list<string>|null
     */
    public static function fromPlanSlug(?string $slug): ?array
    {
        $selection = self::selectionFromPlanSlug($slug);

        return $selection === null ? null : array_keys($selection);
    }

    /**
     * The billing plan for a choice of packages (a list of modules means each at Standard).
     *
     * @param  iterable<mixed>  $choice
     */
    public static function planSlug(iterable $choice): string
    {
        $parts = [];
        foreach (self::selection($choice) as $module => $tier) {
            $parts[] = $tier === self::DEFAULT_TIER ? $module : "{$module}_{$tier}";
        }

        return implode('-', $parts);
    }

    /**
     * The plan's name: "HexaTech Loyalty Pro + HexaTech Content".
     *
     * @param  iterable<mixed>  $choice
     */
    public static function planName(iterable $choice): string
    {
        $names = [];
        foreach (self::selection($choice) as $module => $tier) {
            $names[] = self::name($module) . ($tier === self::DEFAULT_TIER ? '' : ' ' . ucfirst($tier));
        }

        return implode(' + ', $names);
    }

    /**
     * The billing products a choice of packages' plan holds.
     *
     * @param  iterable<mixed>  $choice
     * @return list<string>
     */
    public static function products(iterable $choice): array
    {
        $out = [];
        foreach (array_keys(self::selection($choice)) as $module) {
            foreach (self::MODULES[$module]['products'] as $product) {
                $out[$product] = true;
            }
        }

        return array_keys($out);
    }

    /**
     * The monthly price a choice of packages shows when billing cannot be read, in the currency's smallest unit; null
     * for an empty choice. Every package has a price here (Appointments' too, since 2026-11-04).
     *
     * @param  iterable<mixed>  $choice
     */
    public static function fallbackMonthlyAmount(iterable $choice): ?int
    {
        $selection = self::selection($choice);
        if ($selection === []) {
            return null;
        }
        $sum = 0;
        foreach ($selection as $module => $tier) {
            $sum += self::MODULES[$module]['tiers'][$tier]['monthly_amount'];
        }

        return $sum;
    }

    /** A year at a monthly price, 15 % less (YEARLY_DISCOUNT_PERCENT), in the same unit. */
    public static function yearlyAmount(int $monthlyAmount): int
    {
        return (int) round($monthlyAmount * 12 * (100 - self::YEARLY_DISCOUNT_PERCENT) / 100);
    }

    /**
     * What a choice of packages' plan grants when billing cannot be read: every switch any package turns on, the
     * largest of their limits, the highest support.
     *
     * @param  iterable<mixed>  $choice
     * @return array<string, string>
     */
    public static function features(iterable $choice): array
    {
        $out = array_fill_keys(self::SWITCHES, 'false') + ['priority_support' => 'email'];
        foreach (self::selection($choice) as $module => $tier) {
            foreach (self::MODULES[$module]['tiers'][$tier]['features'] as $key => $value) {
                if ($key === 'ai_monthly_cost_cents') {
                    // One monthly AI budget for the organisation (AiUsageService): two products that spend AI add theirs.
                    $out[$key] = isset($out[$key]) ? (string) ((int) $out[$key] + (int) $value) : $value;
                } elseif (str_starts_with($key, 'max_')) {
                    $out[$key] = isset($out[$key]) ? (string) max((int) $out[$key], (int) $value) : $value;
                } elseif ($key === 'priority_support') {
                    $out[$key] = array_search($value, self::SUPPORT, true) > array_search($out[$key], self::SUPPORT, true) ? $value : $out[$key];
                } elseif ($value === 'true') {
                    $out[$key] = 'true';
                }
            }
        }
        ksort($out);

        return $out;
    }
}
