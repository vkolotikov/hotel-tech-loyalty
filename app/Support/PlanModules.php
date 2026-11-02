<?php

namespace App\Support;

/**
 * The workspaces an organisation may buy on their own (owner, 2026-11-02): HexaTech Loyalty and HexaTech Content,
 * 85 € a month each, beside the Appointments plan (Part C, 2026-10-02). A customer starts with one and adds the
 * others later. Billing has one plan for each set of modules, named by planSlug(): `loyalty`, `content`,
 * `loyalty-content`, `appointments`, `appointments-loyalty`… Adding a product moves the subscription to the plan of
 * the larger set, so Stripe prorates the one price (SubscriptionService::changePlan in the billing application).
 *
 * Who is on modules (Organization::planModules()): billing's products are module products only and name at least one
 * module; a product outside them (crm, chat, education, avatar) makes a full customer. With no products, the plan slug.
 *
 * Prices here are only what the pages show when billing cannot be read; billing's plan rows are the price charged.
 */
final class PlanModules
{
    /**
     * Every module, in the one order used for plan slugs, for where staff land and for every list people see. A
     * module's key is also its workspace (`/loyalty`…) and the AccessMap product its staff may reach. Each names the
     * billing products its plan holds (the first is the one that says the module is there) and its monthly price,
     * in cents, when billing cannot be read.
     */
    public const MODULES = [
        'appointments' => ['products' => ['appointments', 'booking'], 'monthly_amount' => null],
        'loyalty'      => ['products' => ['loyalty'], 'monthly_amount' => 8500],
        'content'      => ['products' => ['content'], 'monthly_amount' => 8500],
    ];

    /** The modules sold through their own sign-up pages (/loyalty/register, /content/register). */
    public const SOLD_ALONE = ['loyalty', 'content'];

    /** The currency and free trial of the modules' plans when billing cannot be read. */
    public const FALLBACK_CURRENCY = 'eur';

    public const FALLBACK_TRIAL_DAYS = 7;

    /**
     * What each module's plan grants when billing cannot be read (AuthController::getTrialFeatures). Billing's plan
     * features decide otherwise. The Appointments plan's are the ones it always had there.
     */
    private const FEATURES = [
        'appointments' => [
            'max_team_members' => '5', 'max_guests' => '1000', 'max_properties' => '1', 'max_loyalty_members' => '500',
        ],
        'loyalty' => [
            'max_team_members' => '5', 'max_guests' => '2000', 'max_properties' => '1', 'max_loyalty_members' => '2000',
            'push_notifications' => 'true', 'mobile_app' => 'true', 'nfc_cards' => 'true', 'campaigns' => 'true',
            'wallet' => 'true',
        ],
        'content' => [
            'max_team_members' => '5', 'max_guests' => '1000', 'max_properties' => '1', 'max_loyalty_members' => '0',
        ],
    ];

    /** Every switch a plan carries, off unless a module turns it on. */
    private const SWITCHES = [
        'ai_insights', 'custom_branding', 'push_notifications', 'mobile_app', 'time_management', 'admin_ai', 'brands',
        'landing_pages', 'campaigns', 'reviews', 'engagement', 'wallet', 'chatbot', 'nfc_cards',
    ];

    /** @return list<string> */
    public static function all(): array
    {
        return array_keys(self::MODULES);
    }

    public static function exists(string $module): bool
    {
        return isset(self::MODULES[$module]);
    }

    /**
     * Known modules once each, in MODULES order.
     *
     * @param  iterable<mixed>  $modules
     * @return list<string>
     */
    public static function normalise(iterable $modules): array
    {
        $given = [];
        foreach ($modules as $module) {
            if (is_string($module)) {
                $given[$module] = true;
            }
        }

        return array_values(array_filter(self::all(), fn (string $m) => isset($given[$m])));
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
     * The modules a plan slug names (`loyalty`, `loyalty-content`…), or null for any other plan. Only the canonical
     * spelling counts, so `content-loyalty` is no module plan.
     *
     * @return list<string>|null
     */
    public static function fromPlanSlug(?string $slug): ?array
    {
        if (!is_string($slug) || $slug === '') {
            return null;
        }
        $parts = explode('-', $slug);
        $modules = self::normalise($parts);

        return $modules !== [] && $modules === $parts ? $modules : null;
    }

    /**
     * The billing plan for a set of modules.
     *
     * @param  iterable<mixed>  $modules
     */
    public static function planSlug(iterable $modules): string
    {
        return implode('-', self::normalise($modules));
    }

    /**
     * The billing products a set of modules' plan holds.
     *
     * @param  iterable<mixed>  $modules
     * @return list<string>
     */
    public static function products(iterable $modules): array
    {
        $out = [];
        foreach (self::normalise($modules) as $module) {
            foreach (self::MODULES[$module]['products'] as $product) {
                $out[$product] = true;
            }
        }

        return array_keys($out);
    }

    /**
     * The price a set of modules shows when billing cannot be read, in the currency's smallest unit; null when a
     * module in it has no price here (Appointments is priced in billing only).
     *
     * @param  iterable<mixed>  $modules
     */
    public static function fallbackMonthlyAmount(iterable $modules): ?int
    {
        $modules = self::normalise($modules);
        if ($modules === []) {
            return null;
        }
        $sum = 0;
        foreach ($modules as $module) {
            $amount = self::MODULES[$module]['monthly_amount'];
            if ($amount === null) {
                return null;
            }
            $sum += $amount;
        }

        return $sum;
    }

    /**
     * What a set of modules' plan grants when billing cannot be read: every switch any of them turns on, and the
     * largest of their limits.
     *
     * @param  iterable<mixed>  $modules
     * @return array<string, string>
     */
    public static function features(iterable $modules): array
    {
        $out = array_fill_keys(self::SWITCHES, 'false');
        foreach (self::normalise($modules) as $module) {
            foreach (self::FEATURES[$module] as $key => $value) {
                if (str_starts_with($key, 'max_')) {
                    $out[$key] = isset($out[$key]) ? (string) max((int) $out[$key], (int) $value) : $value;
                } elseif ($value === 'true') {
                    $out[$key] = 'true';
                }
            }
        }
        ksort($out);

        return $out;
    }
}
