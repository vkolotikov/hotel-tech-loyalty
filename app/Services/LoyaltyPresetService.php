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

        $recommended = $this->recommendedKeyForCurrentOrg();

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
                // Rewards are the part a venue actually judges the programme
                // by — a ladder with nothing to redeem reads as busywork — so
                // the picker shows the count and a couple of examples.
                'reward_count'   => count($p['rewards'] ?? []),
                'sample_rewards' => array_slice(array_column($p['rewards'] ?? [], 'name'), 0, 3),
                'points_per_currency' => $p['points_per_currency'] ?? null,
                'referrer_bonus'      => $p['referrer_bonus'] ?? null,
                // The cheapest reward is what makes the programme concrete:
                // it lets the picker say what a member gets and roughly what
                // they must spend to get it, instead of quoting point totals
                // that mean nothing on their own.
                'cheapest_reward'     => (function () use ($p) {
                    $rewards = $p['rewards'] ?? [];
                    if ($rewards === []) return null;
                    usort($rewards, fn ($a, $b) => $a['points_cost'] <=> $b['points_cost']);
                    return ['name' => $rewards[0]['name'], 'points_cost' => $rewards[0]['points_cost']];
                })(),
                'is_current'     => $current === $key,
                // Ten cards and no steer is a worse decision than one card and
                // a reason. We already know the venue's industry, so say which
                // one we would pick — they stay free to choose another.
                'recommended'    => $recommended === $key,
            ];
        }

        // The picker translates points into spend ("about €5 away"), which
        // reads like a missing symbol without this.
        $currency = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', app()->bound('current_organization_id') ? (int) app('current_organization_id') : 0)
            ->where('key', 'currency_symbol')
            ->value('value');

        return [
            'presets'         => $presets,
            'current'         => $current,
            'currency_symbol' => $currency ?: '',
        ];
    }

    /**
     * Industry Platform Plan Phase 5 — alias resolution for canonical
     * industry ids that don't have a dedicated preset entry. Lets
     * `AuthController::startTrial` pass the org's `industry` directly
     * without knowing whether it maps to a hotel_classic / restaurant /
     * simple_two_tier preset id.
     *
     * The NO_PROGRAMME_INDUSTRIES are intentionally NOT in this map —
     * they short-circuit to a no-op before alias resolution runs.
     *
     * The picker (POST /v1/admin/loyalty-presets/apply) keeps showing
     * the 6 canonical preset cards; aliases are an inbound resolution
     * concern for the industry-platform dispatcher only.
     */
    /**
     * Industries that get NO loyalty programme at all.
     *
     * Must stay in step with INDUSTRY_HIDDEN_GROUPS in
     * frontend/src/lib/industryGating.ts: an industry whose Members &
     * Loyalty nav group is hidden must not have tiers provisioned behind
     * it, and vice versa. Today that is medical alone (decision #5 — no
     * patient loyalty programme).
     */
    /**
     * Which preset we would choose for the current organisation.
     *
     * Resolved from the org's industry through the same alias map the
     * automated signup path uses, so the card the picker highlights is exactly
     * what a hands-off signup would have applied.
     */
    private function recommendedKeyForCurrentOrg(): ?string
    {
        $orgId = app()->bound('current_organization_id')
            ? (int) app('current_organization_id')
            : null;

        if (!$orgId) {
            return null;
        }

        $industry = \App\Models\Organization::withoutGlobalScopes()
            ->find($orgId)?->resolved_industry;

        if (!$industry || in_array($industry, self::NO_PROGRAMME_INDUSTRIES, true)) {
            return null;
        }

        $key = self::ALIASES[$industry] ?? $industry;

        return isset(self::PRESETS[$key]) ? $key : null;
    }

    public const NO_PROGRAMME_INDUSTRIES = ['medical'];

    private const ALIASES = [
        'hotel'       => 'hotel_classic',
        'hospitality' => 'restaurant',
        // These three used to share simple_two_tier. They now have ladders,
        // perks, rewards and point economics of their own — a law firm and a
        // language school were being handed identical programmes.
        'legal'       => 'professional_services',
        'real_estate' => 'real_estate',
        'education'   => 'education',
        // A generic business can absolutely run a simple loyalty scheme —
        // that preset's own docblock calls it "the minimum viable loyalty
        // program for any small business".
        'other'       => 'simple_two_tier',
    ];

    /**
     * Apply a membership preset. Returns a summary.
     *
     * @return array{tiers_set:int,tiers_added:int,benefits_added:int,rewards_added:int,members_on_tiers:int,replaced:bool,noop?:bool}
     */
    public function apply(string $key, int $organizationId): array
    {
        // Industries with no membership programme (decision #5 for
        // medical; legal + real_estate joined them because
        // industryGating hides their Members & Loyalty group).
        //
        // Stamp `members_preset` so the picker renders the dismissed
        // state, but write NOTHING to LoyaltyTier / BenefitDefinition /
        // HotelSetting. Their customers are CRM records, not loyalty
        // members, so a ladder here is invisible dead configuration —
        // plus an expiry policy and birthday cron with nothing to act on.
        if (in_array($key, self::NO_PROGRAMME_INDUSTRIES, true)) {
            CrmSetting::updateOrCreate(
                ['key' => 'members_preset'],
                ['value' => $key],
            );
            // Same marker as the normal path: a medical org's members
            // "onboarding" is the decision that there is no programme —
            // don't walk them through a tier wizard afterwards.
            CrmSetting::updateOrCreate(
                ['key' => 'members_onboarding_completed_at'],
                ['value' => json_encode(now()->toIso8601String())],
            );
            return [
                'tiers_set'        => 0,
                'tiers_added'      => 0,
                'benefits_added'   => 0,
                'rewards_added'    => 0,
                'members_on_tiers' => 0,
                'replaced'         => false,
                'noop'             => true,
            ];
        }

        // Phase 5 — alias resolution. The persisted picker stamp at
        // the end of this method continues to use the RAW input `$key`
        // (admin's actual choice) so listPresets() highlights the
        // correct card.
        $resolvedKey = self::ALIASES[$key] ?? $key;
        $preset = self::PRESETS[$resolvedKey] ?? null;
        if (!$preset) {
            throw new \InvalidArgumentException("Unknown membership preset '{$key}'.");
        }

        $summary = [
            'tiers_set'        => count($preset['tiers']),
            'tiers_added'      => 0,
            'benefits_added'   => 0,
            'rewards_added'    => 0,
            'members_on_tiers' => 0,
            'replaced'         => false,
        ];

        DB::transaction(function () use ($preset, $key, $organizationId, &$summary) {
            // Tier-wipe safety: count ANY member rows for the org, not
            // just members with `tier_id IS NOT NULL`. A real-estate org
            // that imported 5k client contacts before configuring tiers
            // would have member rows with `tier_id = null` — under the
            // old `whereNotNull('tier_id')` count those orgs would still
            // hit the clean-replace branch and lose any tier ladder the
            // admin had since added. Reviewer-flagged data-integrity
            // bug — the additive-by-name path is the safer default for
            // any org that already holds member data.
            $totalMembers = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->count();
            $assigned = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->whereNotNull('tier_id')
                ->count();
            $summary['members_on_tiers'] = $assigned;

            // Clean-replace ONLY when there are zero members of any
            // kind. Any member presence — even without a tier_id —
            // routes to the additive-by-name path. members_on_tiers
            // continues to report the strictly-assigned count for
            // historical compatibility.
            $canReplace = $totalMembers === 0;

            if ($canReplace) {
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

            // Rewards — additive by name, same philosophy as benefits.
            //
            // Nothing seeded these, for any preset or any signup path: every
            // organisation in this product has tiers and ZERO rewards. Members
            // accumulate points against a ladder with nothing at the top of it
            // — the programme looks configured while giving the member no
            // reason to return. This is the loyalty equivalent of shipping a
            // chatbot with an empty knowledge base.
            //
            // Priced against each preset's own tier thresholds, so the cheapest
            // reward is reachable soon after the welcome bonus and the dearest
            // sits around the top tier.
            $existingRewards = \App\Models\Reward::withoutGlobalScopes()
                ->where('organization_id', $organizationId)
                ->pluck('name')
                ->map(fn ($n) => mb_strtolower(trim((string) $n)))
                ->all();

            foreach (($preset['rewards'] ?? []) as $i => $r) {
                if (in_array(mb_strtolower($r['name']), $existingRewards, true)) continue;

                \App\Models\Reward::withoutGlobalScopes()->create(array_merge($r, [
                    'organization_id' => $organizationId,
                    'sort_order'      => $i + 1,
                    'is_active'       => true,
                ]));
                $summary['rewards_added']++;
            }

            // Welcome bonus — same data-safety philosophy as tiers +
            // benefits: only write when the org has no existing
            // members. An org with 500 members joined under a
            // hand-tuned 500-point bonus would otherwise have it
            // silently flipped to the new preset's default (e.g. 100
            // for beauty) and every new signup from that moment on
            // would get the lower bonus with no admin notice.
            // First-signup orgs (totalMembers === 0) still get the
            // industry-appropriate seed.
            if ($canReplace) {
                HotelSetting::withoutGlobalScopes()->updateOrCreate(
                    ['organization_id' => $organizationId, 'key' => 'welcome_bonus_points'],
                    ['value' => (string) ($preset['welcome_bonus'] ?? 500), 'type' => 'number', 'group' => 'loyalty', 'label' => 'Welcome Bonus Points'],
                );
                $summary['welcome_bonus_set'] = (int) ($preset['welcome_bonus'] ?? 500);

                // Point economics travel with the preset. Signup writes a flat
                // 10 points per currency unit and 24-month expiry for everyone,
                // which cannot suit a coffee shop (4 per visit) and a hotel
                // (150 per stay) at the same time: on the flat rate a
                // restaurant regular needs 35 visits to afford a free dessert.
                // Same clean-replace guard as the welcome bonus, so a venue
                // that tuned these by hand keeps them.
                // Referral bonuses belong here too. Signup wrote a flat 250
                // for every business, which reads completely differently
                // depending on the ladder it sits against: for a restaurant
                // it is five visits' worth, for an estate agency whose top
                // tier is 5,000 it is noise — and referrals are the main way
                // that business grows. Calibrated per preset instead.
                foreach ([
                    'points_per_currency'   => ['Points per Currency Unit', $preset['points_per_currency'] ?? null],
                    'points_expiry_months'  => ['Points Expiry (Months)',   $preset['points_expiry_months'] ?? null],
                    'referrer_bonus_points' => ['Referrer Bonus Points',    $preset['referrer_bonus'] ?? null],
                    'referee_bonus_points'  => ['Referee Bonus Points',     $preset['referee_bonus'] ?? null],
                ] as $settingKey => [$label, $value]) {
                    if ($value === null) continue;

                    HotelSetting::withoutGlobalScopes()->updateOrCreate(
                        ['organization_id' => $organizationId, 'key' => $settingKey],
                        ['value' => (string) $value, 'type' => 'number', 'group' => 'loyalty', 'label' => $label],
                    );
                    $summary[$settingKey] = $value;
                }
            } else {
                $summary['welcome_bonus_preserved'] = true;
            }

            // Stamp the active preset so the picker can highlight it.
            CrmSetting::updateOrCreate(
                ['key' => 'members_preset'],
                ['value' => $key],
            );

            // The Members page has its own first-visit gate keyed on this
            // marker. A preset applied at signup IS that onboarding — without
            // the stamp, a freshly provisioned org was walked through a
            // second tier-setup wizard for a ladder it already had.
            CrmSetting::updateOrCreate(
                ['key' => 'members_onboarding_completed_at'],
                ['value' => json_encode(now()->toIso8601String())],
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
            'points_per_currency' => 10,
            'points_expiry_months' => 24,
            'referrer_bonus' => 1000,
            'referee_bonus' => 500,
            'tiers' => [
                ['name' => 'Bronze',   'min_points' => 0,     'earn_rate' => 1.0,  'color_hex' => '#CD7F32', 'perks' => ['Welcome drink on arrival', 'Member-only newsletter']],
                ['name' => 'Silver',   'min_points' => 1000,  'earn_rate' => 1.25, 'color_hex' => '#C0C0C0', 'perks' => ['Late check-out until 2pm', 'Bottled water in room']],
                ['name' => 'Gold',     'min_points' => 5000,  'earn_rate' => 1.5,  'color_hex' => '#FFD700', 'perks' => ['Room upgrade (subject to availability)', 'Early check-in from 11am']],
                ['name' => 'Platinum', 'min_points' => 15000, 'earn_rate' => 2.0,  'color_hex' => '#E5E4E2', 'perks' => ['Guaranteed room upgrade', 'Complimentary breakfast', 'Bonus night every 5 stays']],
                ['name' => 'Diamond',  'min_points' => 50000, 'earn_rate' => 3.0,  'color_hex' => '#B9F2FF', 'perks' => ['Suite upgrade', 'Personal concierge', '24/7 priority line', 'Anniversary gift']],
            ],
            'rewards' => [
                ['name' => 'Late Checkout',             'points_cost' => 600,   'category' => 'room',          'description' => 'Stay until 2pm on departure day.'],
                ['name' => 'Breakfast for Two',         'points_cost' => 1200,  'category' => 'food_beverage', 'description' => 'Complimentary breakfast for two guests.'],
                ['name' => 'Room Upgrade',              'points_cost' => 3000,  'category' => 'room',          'description' => 'One category upgrade, subject to availability.'],
                ['name' => '30-Minute Spa Treatment',   'points_cost' => 6000,  'category' => 'spa',           'description' => 'A 30-minute treatment of your choice.'],
                ['name' => 'Free Night',                'points_cost' => 15000, 'category' => 'stay',          'description' => 'One complimentary night in a standard room.'],
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
            'points_per_currency' => 10,
            'points_expiry_months' => 24,
            'referrer_bonus' => 600,
            'referee_bonus' => 300,
            'tiers' => [
                ['name' => 'Member', 'min_points' => 0,     'earn_rate' => 1.0, 'color_hex' => '#94a3b8', 'perks' => ['Member rates', 'Welcome amenity']],
                ['name' => 'Plus',   'min_points' => 2000,  'earn_rate' => 1.5, 'color_hex' => '#3b82f6', 'perks' => ['Late check-out', 'Free Wi-Fi upgrade', 'Welcome drink']],
                ['name' => 'Elite',  'min_points' => 10000, 'earn_rate' => 2.0, 'color_hex' => '#fbbf24', 'perks' => ['Room upgrade', 'Complimentary breakfast', 'Priority booking']],
            ],
            'rewards' => [
                ['name' => 'Welcome Drink',             'points_cost' => 300,   'category' => 'food_beverage', 'description' => 'A drink on us when you arrive.'],
                ['name' => 'Late Checkout',             'points_cost' => 600,   'category' => 'room',          'description' => 'Stay until 2pm on departure day.'],
                ['name' => 'Breakfast for Two',         'points_cost' => 1500,  'category' => 'food_beverage', 'description' => 'Complimentary breakfast for two guests.'],
                ['name' => 'Room Upgrade',              'points_cost' => 3000,  'category' => 'room',          'description' => 'One category upgrade, subject to availability.'],
                ['name' => 'Free Night',                'points_cost' => 10000, 'category' => 'stay',          'description' => 'One complimentary night in a standard room.'],
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
            'points_per_currency' => 10,
            'points_expiry_months' => 18,
            'referrer_bonus' => 300,
            'referee_bonus' => 150,
            'tiers' => [
                ['name' => 'Welcome',      'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#f9a8d4', 'perks' => ['Birthday gift', '10% off retail']],
                ['name' => 'Devotee',      'min_points' => 500,  'earn_rate' => 1.5, 'color_hex' => '#ec4899', 'perks' => ['15% off treatments', 'Priority booking', 'Welcome gift on every visit']],
                ['name' => 'Inner Circle', 'min_points' => 2000, 'earn_rate' => 2.0, 'color_hex' => '#a21caf', 'perks' => ['20% off treatments', '1 free treatment yearly', 'Exclusive event invitations']],
            ],
            'rewards' => [
                ['name' => 'Brow Tidy',                 'points_cost' => 200,   'category' => 'add_on',        'description' => 'A quick brow shape added to any appointment.'],
                ['name' => '10 Off Any Service',        'points_cost' => 400,   'category' => 'discount',      'description' => 'Money off your next treatment.'],
                ['name' => 'Hand Treatment',            'points_cost' => 700,   'category' => 'treatment',     'description' => 'A complimentary express hand treatment.'],
                ['name' => '30-Minute Massage',         'points_cost' => 1200,  'category' => 'treatment',     'description' => 'A 30-minute massage of your choice.'],
                ['name' => 'Treatment of Your Choice',  'points_cost' => 2500,  'category' => 'treatment',     'description' => 'Any single standard treatment, on us.'],
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
            'points_per_currency' => 20,
            'points_expiry_months' => 12,
            'referrer_bonus' => 150,
            'referee_bonus' => 100,
            'tiers' => [
                ['name' => 'Regular',  'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#f59e0b', 'perks' => ['Welcome bite-size dessert', 'Birthday treat']],
                ['name' => 'Loyalist', 'min_points' => 300,  'earn_rate' => 1.5, 'color_hex' => '#d97706', 'perks' => ['Priority reservations', '10% off à la carte', 'Free aperitif']],
                ['name' => 'Insider',  'min_points' => 1500, 'earn_rate' => 2.0, 'color_hex' => '#92400e', 'perks' => ['Chef\'s table access', 'Private tasting events', '15% off everything']],
            ],
            'rewards' => [
                ['name' => 'Free Coffee',               'points_cost' => 100,   'category' => 'food_beverage', 'description' => 'Any hot drink, on the house.'],
                ['name' => 'Free Dessert',              'points_cost' => 200,   'category' => 'food_beverage', 'description' => 'Any dessert from the menu.'],
                ['name' => 'Free Starter',              'points_cost' => 350,   'category' => 'food_beverage', 'description' => 'Any starter from the menu.'],
                ['name' => '20% Off the Bill',          'points_cost' => 700,   'category' => 'discount',      'description' => 'One fifth off your food bill.'],
                ['name' => 'Dinner for Two',            'points_cost' => 1800,  'category' => 'food_beverage', 'description' => 'Two courses each for two people.'],
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
            'points_per_currency' => 10,
            'points_expiry_months' => 18,
            'referrer_bonus' => 500,
            'referee_bonus' => 300,
            'tiers' => [
                ['name' => 'Member', 'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#22d3ee', 'perks' => ['Standard class access', 'Locker rental']],
                ['name' => 'Plus',   'min_points' => 1000, 'earn_rate' => 1.5, 'color_hex' => '#0891b2', 'perks' => ['Premium classes', '1 free PT session monthly', '10% off retail']],
                ['name' => 'Pro',    'min_points' => 5000, 'earn_rate' => 2.0, 'color_hex' => '#155e75', 'perks' => ['Unlimited PT sessions', 'Guest passes (2/month)', '20% off retail', 'Free nutrition consult']],
            ],
            'rewards' => [
                ['name' => 'Protein Shake',             'points_cost' => 250,   'category' => 'food_beverage', 'description' => 'Any shake from the bar.'],
                ['name' => 'Guest Day Pass',            'points_cost' => 300,   'category' => 'guest',         'description' => 'Bring a friend for a full day.'],
                ['name' => 'PT Taster Session',         'points_cost' => 900,   'category' => 'training',      'description' => 'A 30-minute session with a trainer.'],
                ['name' => 'Five Class Pack',           'points_cost' => 2000,  'category' => 'classes',       'description' => 'Five classes to use whenever you like.'],
                ['name' => 'One Month Membership',      'points_cost' => 5000,  'category' => 'membership',    'description' => 'A full month, on us.'],
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
            'points_per_currency' => 10,
            'points_expiry_months' => 24,
            'referrer_bonus' => 250,
            'referee_bonus' => 250,
            'tiers' => [
                ['name' => 'Member', 'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#94a3b8', 'perks' => ['Member-only offers', 'Birthday gift']],
                ['name' => 'VIP',    'min_points' => 2000, 'earn_rate' => 2.0, 'color_hex' => '#fbbf24', 'perks' => ['All Member perks', '15% off everything', 'Priority customer support']],
            ],
            'rewards' => [
                ['name' => '5 Credit',                  'points_cost' => 250,   'category' => 'discount',      'description' => 'Money off your next visit.'],
                ['name' => '10% Off',                   'points_cost' => 500,   'category' => 'discount',      'description' => 'One tenth off your next purchase.'],
                ['name' => '15 Credit',                 'points_cost' => 1000,  'category' => 'discount',      'description' => 'A larger credit towards your next visit.'],
                ['name' => 'VIP Perk of Your Choice',   'points_cost' => 2000,  'category' => 'vip',           'description' => 'Pick any perk from the VIP tier.'],
            ],
            'benefits' => [
                ['name' => 'Member Discount', 'code' => 'member_discount', 'description' => 'Tier-based percentage discount', 'category' => 'retail'],
                ['name' => 'Birthday Gift',   'code' => 'birthday_gift',   'description' => 'Complimentary gift on birthday', 'category' => 'gift'],
                ['name' => 'Priority Support','code' => 'priority_support','description' => 'Skip-the-queue support access',  'category' => 'service'],
            ],
        ],

        // ─── Industries that used to fall back to the generic two-tier ────
        // legal, real_estate and education all resolved to simple_two_tier,
        // so three quite different businesses were handed the same ladder,
        // the same perks and the same rewards. A law firm rewarding repeat
        // instructions and a language school rewarding course completions
        // have almost nothing in common except the word "loyalty".

        'education' => [
            'label'         => 'Education — Learner ladder',
            'description'   => 'Learner to Scholar to Alumni. Rewards course completions and long-term study rather than spend.',
            'icon'          => 'graduation-cap',
            'welcome_bonus' => 150,
            'points_per_currency' => 5,
            'points_expiry_months' => 24,
            'referrer_bonus' => 800,
            'referee_bonus' => 400,
            'tiers' => [
                ['name' => 'Learner', 'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#60a5fa', 'perks' => ['Course materials included', 'Member newsletter']],
                ['name' => 'Scholar', 'min_points' => 800,  'earn_rate' => 1.5, 'color_hex' => '#2563eb', 'perks' => ['Priority enrolment', 'Free study resources']],
                ['name' => 'Alumni',  'min_points' => 3000, 'earn_rate' => 2.0, 'color_hex' => '#1e3a8a', 'perks' => ['Alumni events', 'Discount on every future course', 'Reference on request']],
            ],
            'rewards' => [
                ['name' => 'Study Pack',            'points_cost' => 200,  'category' => 'materials', 'description' => 'Printed materials for your current course.'],
                ['name' => '10% Off Next Course',   'points_cost' => 500,  'category' => 'discount',  'description' => 'Money off your next enrolment.'],
                ['name' => 'One-to-One Tutor Hour', 'points_cost' => 1200, 'category' => 'tuition',   'description' => 'An hour with a tutor of your choice.'],
                ['name' => 'Free Short Course',     'points_cost' => 3000, 'category' => 'course',    'description' => 'Any short course on us.'],
            ],
            'benefits' => [
                ['name' => 'Course Materials',   'code' => 'course_materials',   'description' => 'Materials included with enrolment', 'category' => 'materials'],
                ['name' => 'Priority Enrolment', 'code' => 'priority_enrolment', 'description' => 'First access to popular courses',   'category' => 'service'],
                ['name' => 'Alumni Events',      'code' => 'alumni_events',      'description' => 'Invitations to alumni-only events', 'category' => 'event'],
                ['name' => 'Tutor Session',      'code' => 'tutor_session',      'description' => 'One-to-one time with a tutor',      'category' => 'tuition'],
            ],
        ],

        'professional_services' => [
            'label'         => 'Professional services — Client care',
            'description'   => 'Client to Preferred to Partner. Built for high-value, low-frequency work where referrals matter more than visits.',
            'icon'          => 'briefcase',
            'welcome_bonus' => 100,
            // Invoices here are large and infrequent, so a hotel-style 10
            // points per unit would put every client in the top tier after a
            // single matter.
            'points_per_currency' => 2,
            'points_expiry_months' => 36,
            'referrer_bonus' => 2000,
            'referee_bonus' => 500,
            'tiers' => [
                ['name' => 'Client',    'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#94a3b8', 'perks' => ['Named point of contact', 'Client newsletter']],
                ['name' => 'Preferred', 'min_points' => 1000, 'earn_rate' => 1.5, 'color_hex' => '#475569', 'perks' => ['Priority appointments', 'Annual review call']],
                ['name' => 'Partner',   'min_points' => 4000, 'earn_rate' => 2.0, 'color_hex' => '#0f172a', 'perks' => ['Direct line to your adviser', 'Complimentary annual review', 'Referral thank-you']],
            ],
            'rewards' => [
                ['name' => 'Priority Appointment',   'points_cost' => 300,  'category' => 'service',      'description' => 'Next available slot, held for you.'],
                ['name' => 'Document Review',        'points_cost' => 800,  'category' => 'service',      'description' => 'A single document reviewed at no charge.'],
                ['name' => '30-Minute Consultation', 'points_cost' => 1500, 'category' => 'consultation', 'description' => 'A half-hour with an adviser.'],
                ['name' => 'Annual Review Meeting',  'points_cost' => 4000, 'category' => 'consultation', 'description' => 'A full review of your affairs.'],
            ],
            'benefits' => [
                ['name' => 'Named Contact',      'code' => 'named_contact',     'description' => 'A single named point of contact', 'category' => 'service'],
                ['name' => 'Priority Booking',   'code' => 'priority_booking',  'description' => 'Priority access to appointments', 'category' => 'service'],
                ['name' => 'Annual Review',      'code' => 'annual_review',     'description' => 'Complimentary yearly review',     'category' => 'consultation'],
                ['name' => 'Referral Thank-You', 'code' => 'referral_thankyou', 'description' => 'A thank-you for every referral',  'category' => 'gift'],
            ],
        ],

        'real_estate' => [
            'label'         => 'Property — Client & referral',
            'description'   => 'Client to Preferred to Partner. Transactions are rare and large, so this rewards referrals and repeat instructions.',
            'icon'          => 'home',
            'welcome_bonus' => 100,
            // One transaction can be six figures; 1 point per unit keeps the
            // ladder meaningful instead of topping out on day one.
            'points_per_currency' => 1,
            'points_expiry_months' => 36,
            'referrer_bonus' => 2500,
            'referee_bonus' => 500,
            'tiers' => [
                ['name' => 'Client',    'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#5eead4', 'perks' => ['Priority viewing slots', 'Market updates']],
                ['name' => 'Preferred', 'min_points' => 1200, 'earn_rate' => 1.5, 'color_hex' => '#14b8a6', 'perks' => ['Free valuation', 'Featured listing placement']],
                ['name' => 'Partner',   'min_points' => 5000, 'earn_rate' => 2.0, 'color_hex' => '#0f766e', 'perks' => ['Professional photography', 'Priority marketing', 'Moving-day support']],
            ],
            'rewards' => [
                ['name' => 'Priority Viewing Slot',    'points_cost' => 300,  'category' => 'service',   'description' => 'First pick of viewing times.'],
                ['name' => 'Local Market Report',      'points_cost' => 600,  'category' => 'report',    'description' => 'A written report on your area.'],
                ['name' => 'Professional Photography', 'points_cost' => 2000, 'category' => 'marketing', 'description' => 'A full photo shoot for your listing.'],
                ['name' => 'Moving Day Support',       'points_cost' => 5000, 'category' => 'service',   'description' => 'Help coordinating your move.'],
            ],
            'benefits' => [
                ['name' => 'Priority Viewings', 'code' => 'priority_viewings', 'description' => 'First access to new listings',     'category' => 'service'],
                ['name' => 'Free Valuation',    'code' => 'free_valuation',    'description' => 'Complimentary property valuation', 'category' => 'service'],
                ['name' => 'Featured Listing',  'code' => 'featured_listing',  'description' => 'Prominent placement when selling', 'category' => 'marketing'],
                ['name' => 'Moving Support',    'code' => 'moving_support',    'description' => 'Assistance on moving day',         'category' => 'service'],
            ],
        ],

        'retail' => [
            'label'         => 'Retail / Shop — Member ladder',
            'description'   => 'Member to Insider to VIP. Frequent small purchases, so rewards land early and often.',
            'icon'          => 'shopping-bag',
            'welcome_bonus' => 100,
            'points_per_currency' => 10,
            'points_expiry_months' => 18,
            'referrer_bonus' => 300,
            'referee_bonus' => 200,
            'tiers' => [
                ['name' => 'Member',  'min_points' => 0,    'earn_rate' => 1.0, 'color_hex' => '#a5b4fc', 'perks' => ['Member pricing', 'Birthday treat']],
                ['name' => 'Insider', 'min_points' => 750,  'earn_rate' => 1.5, 'color_hex' => '#6366f1', 'perks' => ['Early access to sales', 'Free returns']],
                ['name' => 'VIP',     'min_points' => 3000, 'earn_rate' => 2.0, 'color_hex' => '#4338ca', 'perks' => ['First look at new stock', 'Personal shopping', 'Free delivery always']],
            ],
            'rewards' => [
                ['name' => '5 Credit',             'points_cost' => 250,  'category' => 'discount', 'description' => 'Money off your next purchase.'],
                ['name' => 'Free Delivery',        'points_cost' => 400,  'category' => 'service',  'description' => 'Delivery on us, one order.'],
                ['name' => '10% Off',              'points_cost' => 750,  'category' => 'discount', 'description' => 'One tenth off a single order.'],
                ['name' => '20 Credit',            'points_cost' => 2000, 'category' => 'discount', 'description' => 'A larger credit to spend in store.'],
                ['name' => 'VIP Early Access Day', 'points_cost' => 3000, 'category' => 'vip',      'description' => 'Shop the sale a day before everyone else.'],
            ],
            'benefits' => [
                ['name' => 'Member Pricing', 'code' => 'member_pricing', 'description' => 'Tier-based pricing on everything', 'category' => 'retail'],
                ['name' => 'Early Access',   'code' => 'early_access',   'description' => 'Shop sales before the public',     'category' => 'retail'],
                ['name' => 'Free Returns',   'code' => 'free_returns',   'description' => 'Returns at no cost',               'category' => 'service'],
                ['name' => 'Birthday Treat', 'code' => 'birthday_treat', 'description' => 'A gift in your birthday month',    'category' => 'gift'],
            ],
        ],
    ];
}
