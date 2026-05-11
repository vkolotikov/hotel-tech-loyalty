<?php

namespace App\Services;

use App\Models\BenefitDefinition;
use App\Models\CrmSetting;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use Illuminate\Support\Facades\DB;

/**
 * One-click membership setup for the loyalty program — third member
 * of the preset family alongside IndustryPresetService (CRM) and
 * PlannerPresetService (planner).
 *
 * Each preset bundles:
 *   1. Tiers — name, min_points, earn_rate, color, perks list
 *   2. Benefit definitions — the seed catalog the org can attach to
 *      tiers via the existing Settings → Loyalty tab
 *   3. A welcome bonus points value (stored in hotel_settings)
 *
 * Applying is **mostly idempotent**:
 *   - When NO members have a tier_id yet, we treat this as a fresh
 *     setup → tiers + benefits are replaced cleanly with the preset.
 *   - When members exist on tiers, we keep their tiers active (data
 *     integrity wins over preset purity) and only ADD missing tiers
 *     + benefits by name. Admin can deactivate the unwanted ones
 *     from Settings → Loyalty afterwards.
 *
 * Atomic via DB::transaction.
 */
class LoyaltyPresetService
{
    /**
     * @return array{presets:array,current:?string}
     */
    public function listPresets(): array
    {
        $current = optional(CrmSetting::where('key', 'members_preset')->first())->value;
        $current = is_string($current) ? trim($current, '"') : null;

        $presets = [];
        foreach (self::PRESETS as $key => $p) {
            $presets[] = [
                'key'            => $key,
                'label'          => $p['label'],
                'description'    => $p['description'],
                'icon'           => $p['icon'],
                'tier_count'     => count($p['tiers']),
                'benefit_count'  => count($p['benefits']),
                'tier_names'     => array_column($p['tiers'], 'name'),
                'welcome_bonus'  => $p['welcome_bonus'] ?? 500,
                'is_current'     => $current === $key,
            ];
        }

        return ['presets' => $presets, 'current' => $current];
    }

    /**
     * Apply a membership preset. Returns a summary.
     *
     * @return array{tiers_set:int,tiers_added:int,benefits_added:int,members_on_tiers:int,replaced:bool}
     */
    public function apply(string $key, int $organizationId): array
    {
        $preset = self::PRESETS[$key] ?? null;
        if (!$preset) {
            throw new \InvalidArgumentException("Unknown membership preset '{$key}'.");
        }

        $summary = [
            'tiers_set'        => count($preset['tiers']),
            'tiers_added'      => 0,
            'benefits_added'   => 0,
            'members_on_tiers' => 0,
            'replaced'         => false,
        ];

        DB::transaction(function () use ($preset, $key, $organizationId, &$summary) {
            // Count members already assigned to a tier. If zero, it's
            // safe to replace cleanly; otherwise we add-only to keep
            // their tier history intact.
            $assigned = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->whereNotNull('tier_id')
                ->count();
            $summary['members_on_tiers'] = $assigned;

            if ($assigned === 0) {
                // Clean replacement — only safe when no member rows
                // reference any tier. Use withoutGlobalScopes to make
                // sure we're operating on the right org's rows.
                LoyaltyTier::withoutGlobalScopes()
                    ->where('organization_id', $organizationId)
                    ->delete();
                $summary['replaced'] = true;

                foreach ($preset['tiers'] as $i => $tier) {
                    LoyaltyTier::withoutGlobalScopes()->create(array_merge($tier, [
                        'organization_id' => $organizationId,
                        'sort_order'      => $tier['sort_order'] ?? ($i + 1),
                        'is_active'       => true,
                    ]));
                }
                $summary['tiers_added'] = count($preset['tiers']);
            } else {
                // Members exist on tiers — additive only. Skip any
                // tier whose `name` already exists for this org.
                $existing = LoyaltyTier::withoutGlobalScopes()
                    ->where('organization_id', $organizationId)
                    ->pluck('name')
                    ->map(fn ($n) => mb_strtolower($n))
                    ->all();

                foreach ($preset['tiers'] as $i => $tier) {
                    if (in_array(mb_strtolower($tier['name']), $existing, true)) continue;
                    LoyaltyTier::withoutGlobalScopes()->create(array_merge($tier, [
                        'organization_id' => $organizationId,
                        'sort_order'      => $tier['sort_order'] ?? ($i + 1),
                        'is_active'       => true,
                    ]));
                    $summary['tiers_added']++;
                }
            }

            // Benefits — additive by `code`. Existing rows untouched
            // because admins often customise benefit descriptions.
            $existingBenefits = BenefitDefinition::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->pluck('code')
                ->all();

            foreach ($preset['benefits'] as $i => $b) {
                if (in_array($b['code'], $existingBenefits, true)) continue;
                BenefitDefinition::withoutGlobalScopes()->create(array_merge($b, [
                    'organization_id' => $organizationId,
                    'sort_order'      => $b['sort_order'] ?? ($i + 1),
                    'is_active'       => true,
                ]));
                $summary['benefits_added']++;
            }

            // Welcome bonus — hotel_setting key/value.
            HotelSetting::withoutGlobalScopes()->updateOrCreate(
                ['organization_id' => $organizationId, 'key' => 'welcome_bonus_points'],
                ['value' => (string) ($preset['welcome_bonus'] ?? 500), 'type' => 'number', 'group' => 'loyalty', 'label' => 'Welcome Bonus Points'],
            );

            // Stamp the active preset so the picker can highlight it.
            CrmSetting::updateOrCreate(
                ['key' => 'members_preset'],
                ['value' => $key],
            );
        });

        return $summary;
    }

    /**
     * Six starter membership programs covering the most common
     * verticals. Tier shapes differ on purpose:
     *
     *  - hotel_classic / hotel_lite — points-based, classic loyalty
     *  - beauty — visit-frequency-driven
     *  - restaurant — spend-driven (lower point thresholds)
     *  - fitness — engagement-driven (sessions / attendance)
     *  - simple_two_tier — for tiny orgs that just need "Member / VIP"
     */
    public const PRESETS = [
        'hotel_classic' => [
            'label'         => 'Hotel — Classic 5-tier',
            'description'   => 'The canonical Bronze → Diamond ladder. Points earned per stay; earn rate scales with tier.',
            'icon'          => 'building-2',
            'welcome_bonus' => 500,
            'tiers' => [
                ['name' => 'Bronze',   'min_points' => 0,     'earn_rate' => 1.0,  'color_hex' => '#CD7F32', 'perks' => ['Welcome drink on arrival', 'Member-only newsletter']],
                ['name' => 'Silver',   'min_points' => 1000,  'earn_rate' => 1.25, 'color_hex' => '#C0C0C0', 'perks' => ['Late check-out until 2pm', 'Bottled water in room']],
                ['name' => 'Gold',     'min_points' => 5000,  'earn_rate' => 1.5,  'color_hex' => '#FFD700', 'perks' => ['Room upgrade (subject to availability)', 'Early check-in from 11am']],
                ['name' => 'Platinum', 'min_points' => 15000, 'earn_rate' => 2.0,  'color_hex' => '#E5E4E2', 'perks' => ['Guaranteed room upgrade', 'Complimentary breakfast', 'Bonus night every 5 stays']],
                ['name' => 'Diamond',  'min_points' => 50000, 'earn_rate' => 3.0,  'color_hex' => '#B9F2FF', 'perks' => ['Suite upgrade', 'Personal concierge', '24/7 priority line', 'Anniversary gift']],
            ],
            'benefits' => [
                ['name' => 'Welcome Drink',     'code' => 'welcome_drink',     'description' => 'Complimentary welcome drink on arrival',           'category' => 'food_beverage'],
                ['name' => 'Late Checkout',     'code' => 'late_checkout',     'description' => 'Late checkout until 2pm',                          'category' => 'room'],
                ['name' => 'Room Upgrade',      'code' => 'room_upgrade',      'description' => 'Complimentary room upgrade (subject to availability)', 'category' => 'room'],
                ['name' => 'Spa Discount',      'code' => 'spa_discount',      'description' => '15% discount on all spa treatments',               'category' => 'spa'],
                ['name' => 'Early Check-in',    'code' => 'early_checkin',     'description' => 'Early check-in from 11am',                         'category' => 'room'],
                ['name' => 'Airport Transfer',  'code' => 'airport_transfer',  'description' => 'Complimentary airport transfer',                   'category' => 'transport'],
            ],
        ],

        'hotel_lite' => [
            'label'         => 'Hotel — Lite 3-tier',
            'description'   => 'Simplified Member / Plus / Elite ladder. Good for smaller properties or boutique hotels.',
            'icon'          => 'building-2',
            'welcome_bonus' => 250,
            'tiers' => [
                ['name' => 'Member', 'min_points' => 0,     'earn_rate' => 1.0, 'color_hex' => '#94a3b8', 'perks' => ['Member rates', 'Welcome amenity']],
                ['name' => 'Plus',   'min_points' => 2000,  'earn_rate' => 1.5, 'color_hex' => '#3b82f6', 'perks' => ['Late check-out', 'Free Wi-Fi upgrade', 'Welcome drink']],
                ['name' => 'Elite',  'min_points' => 10000, 'earn_rate' => 2.0, 'color_hex' => '#fbbf24', 'perks' => ['Room upgrade', 'Complimentary breakfast', 'Priority booking']],
            ],
            'benefits' => [
                ['name' => 'Welcome Drink',  'code' => 'welcome_drink',  'description' => 'Complimentary welcome drink on arrival', 'category' => 'food_beverage'],
                ['name' => 'Late Checkout',  'code' => 'late_checkout',  'description' => 'Late checkout until 2pm',                'category' => 'room'],
                ['name' => 'Room Upgrade',   'code' => 'room_upgrade',   'description' => 'Complimentary room upgrade',             'category' => 'room'],
                ['name' => 'Free Breakfast', 'code' => 'free_breakfast', 'description' => 'Complimentary breakfast for two',        'category' => 'food_beverage'],
            ],
        ],

        'beauty' => [
            'label'         => 'Beauty / Spa — Visit ladder',
            'description'   => 'Welcome → Devotee → Inner Circle. Points reward repeat visits; perks lean to spa & retail.',
            'icon'          => 'sparkles',
            'welcome_bonus' => 100,
            'tiers' => [
                ['name' => 'Welcome',      'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#f9a8d4', 'perks' => ['Birthday gift', '10% off retail']],
                ['name' => 'Devotee',      'min_points' => 500,  'earn_rate' => 1.5, 'color_hex' => '#ec4899', 'perks' => ['15% off treatments', 'Priority booking', 'Welcome gift on every visit']],
                ['name' => 'Inner Circle', 'min_points' => 2000, 'earn_rate' => 2.0, 'color_hex' => '#a21caf', 'perks' => ['20% off treatments', '1 free treatment yearly', 'Exclusive event invitations']],
            ],
            'benefits' => [
                ['name' => 'Birthday Gift',         'code' => 'birthday_gift',     'description' => 'Complimentary product or mini-treatment on birthday month', 'category' => 'gift'],
                ['name' => 'Retail Discount',       'code' => 'retail_discount',   'description' => 'Tier-based discount on retail products',                    'category' => 'retail'],
                ['name' => 'Treatment Discount',    'code' => 'treatment_discount','description' => 'Tier-based discount on spa treatments',                     'category' => 'spa'],
                ['name' => 'Priority Booking',      'code' => 'priority_booking',  'description' => 'Skip-the-line access to popular slots',                     'category' => 'service'],
            ],
        ],

        'restaurant' => [
            'label'         => 'Restaurant — Spend ladder',
            'description'   => 'Regular → Loyalist → Insider. Low point thresholds tuned for per-visit spend.',
            'icon'          => 'utensils',
            'welcome_bonus' => 50,
            'tiers' => [
                ['name' => 'Regular',  'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#f59e0b', 'perks' => ['Welcome bite-size dessert', 'Birthday treat']],
                ['name' => 'Loyalist', 'min_points' => 300,  'earn_rate' => 1.5, 'color_hex' => '#d97706', 'perks' => ['Priority reservations', '10% off à la carte', 'Free aperitif']],
                ['name' => 'Insider',  'min_points' => 1500, 'earn_rate' => 2.0, 'color_hex' => '#92400e', 'perks' => ['Chef\'s table access', 'Private tasting events', '15% off everything']],
            ],
            'benefits' => [
                ['name' => 'Welcome Bite',          'code' => 'welcome_bite',         'description' => 'Complimentary amuse-bouche on arrival', 'category' => 'food_beverage'],
                ['name' => 'Birthday Treat',        'code' => 'birthday_treat',       'description' => 'Complimentary dessert on birthday',     'category' => 'food_beverage'],
                ['name' => 'Priority Reservation',  'code' => 'priority_reservation', 'description' => 'Last-minute slot access',               'category' => 'service'],
                ['name' => 'Menu Discount',         'code' => 'menu_discount',        'description' => 'Tier-based discount on the food bill',  'category' => 'food_beverage'],
            ],
        ],

        'fitness' => [
            'label'         => 'Fitness — Engagement ladder',
            'description'   => 'Member → Plus → Pro. Points scale with class attendance + personal-training sessions.',
            'icon'          => 'dumbbell',
            'welcome_bonus' => 200,
            'tiers' => [
                ['name' => 'Member', 'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#22d3ee', 'perks' => ['Standard class access', 'Locker rental']],
                ['name' => 'Plus',   'min_points' => 1000, 'earn_rate' => 1.5, 'color_hex' => '#0891b2', 'perks' => ['Premium classes', '1 free PT session monthly', '10% off retail']],
                ['name' => 'Pro',    'min_points' => 5000, 'earn_rate' => 2.0, 'color_hex' => '#155e75', 'perks' => ['Unlimited PT sessions', 'Guest passes (2/month)', '20% off retail', 'Free nutrition consult']],
            ],
            'benefits' => [
                ['name' => 'Class Access',     'code' => 'class_access',     'description' => 'Tier-based access to premium classes', 'category' => 'service'],
                ['name' => 'PT Sessions',      'code' => 'pt_sessions',      'description' => 'Complimentary personal-training sessions per month', 'category' => 'service'],
                ['name' => 'Guest Pass',       'code' => 'guest_pass',       'description' => 'Bring a guest for free',               'category' => 'service'],
                ['name' => 'Retail Discount',  'code' => 'retail_discount',  'description' => 'Discount on apparel + supplements',   'category' => 'retail'],
            ],
        ],

        'simple_two_tier' => [
            'label'         => 'Simple two-tier',
            'description'   => 'Member + VIP. The minimum viable loyalty program for any small business — easy to manage.',
            'icon'          => 'star',
            'welcome_bonus' => 100,
            'tiers' => [
                ['name' => 'Member', 'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#94a3b8', 'perks' => ['Member-only offers', 'Birthday gift']],
                ['name' => 'VIP',    'min_points' => 2000, 'earn_rate' => 2.0, 'color_hex' => '#fbbf24', 'perks' => ['All Member perks', '15% off everything', 'Priority customer support']],
            ],
            'benefits' => [
                ['name' => 'Member Discount', 'code' => 'member_discount', 'description' => 'Tier-based percentage discount', 'category' => 'retail'],
                ['name' => 'Birthday Gift',   'code' => 'birthday_gift',   'description' => 'Complimentary gift on birthday', 'category' => 'gift'],
                ['name' => 'Priority Support','code' => 'priority_support','description' => 'Skip-the-queue support access',  'category' => 'service'],
            ],
        ],
    ];
}
