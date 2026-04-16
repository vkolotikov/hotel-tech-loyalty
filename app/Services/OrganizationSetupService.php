<?php

namespace App\Services;

use App\Models\BenefitDefinition;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Property;
use App\Models\ReviewForm;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class OrganizationSetupService
{
    /**
     * Set up a new organization with default tiers and settings.
     * Idempotent — safe to call multiple times (uses firstOrCreate).
     */
    public function setupDefaults(Organization $org): void
    {
        // Bind org context for BelongsToOrganization trait
        app()->instance('current_organization_id', $org->id);

        // Create default property
        Property::withoutGlobalScopes()->firstOrCreate(
            ['organization_id' => $org->id, 'code' => Str::upper(Str::substr($org->slug ?? 'HTL', 0, 5)) . '01'],
            [
                'name'    => $org->name . ' Main',
                'city'    => '',
                'country' => $org->country ?? '',
            ]
        );

        // Create default tiers — column is "earn_rate" not "earn_multiplier"
        $tiers = [
            ['name' => 'Bronze',   'min_points' => 0,     'earn_rate' => 1.0,  'color_hex' => '#CD7F32', 'sort_order' => 1],
            ['name' => 'Silver',   'min_points' => 1000,  'earn_rate' => 1.25, 'color_hex' => '#C0C0C0', 'sort_order' => 2],
            ['name' => 'Gold',     'min_points' => 5000,  'earn_rate' => 1.5,  'color_hex' => '#FFD700', 'sort_order' => 3],
            ['name' => 'Platinum', 'min_points' => 15000, 'earn_rate' => 2.0,  'color_hex' => '#E5E4E2', 'sort_order' => 4],
            ['name' => 'Diamond',  'min_points' => 50000, 'earn_rate' => 3.0,  'color_hex' => '#B9F2FF', 'sort_order' => 5],
        ];

        foreach ($tiers as $tier) {
            LoyaltyTier::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'name' => $tier['name']],
                array_merge($tier, ['is_active' => true])
            );
        }

        // Create default benefits — code is NOT NULL
        $benefits = [
            ['name' => 'Welcome Drink',   'code' => 'welcome_drink',    'description' => 'Complimentary welcome drink on arrival', 'category' => 'food_beverage', 'sort_order' => 1],
            ['name' => 'Late Checkout',    'code' => 'late_checkout',    'description' => 'Late checkout until 2pm',               'category' => 'room',           'sort_order' => 2],
            ['name' => 'Room Upgrade',     'code' => 'room_upgrade',     'description' => 'Complimentary room upgrade (subject to availability)', 'category' => 'room', 'sort_order' => 3],
            ['name' => 'Spa Discount',     'code' => 'spa_discount',     'description' => '15% discount on all spa treatments',   'category' => 'spa',            'sort_order' => 4],
            ['name' => 'Early Check-in',   'code' => 'early_checkin',    'description' => 'Early check-in from 11am',              'category' => 'room',           'sort_order' => 5],
            ['name' => 'Airport Transfer', 'code' => 'airport_transfer', 'description' => 'Complimentary airport transfer',        'category' => 'transport',      'sort_order' => 6],
        ];

        foreach ($benefits as $b) {
            BenefitDefinition::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'code' => $b['code']],
                array_merge($b, ['is_active' => true])
            );
        }

        // Default settings — type, group, label are NOT NULL
        $defaults = [
            ['key' => 'hotel_name',            'value' => $org->name, 'type' => 'text',   'group' => 'general',    'label' => 'Hotel Name'],
            ['key' => 'welcome_bonus_points',  'value' => '500',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Welcome Bonus Points'],
            ['key' => 'referrer_bonus_points', 'value' => '250',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Referrer Bonus Points'],
            ['key' => 'referee_bonus_points',  'value' => '250',      'type' => 'number', 'group' => 'loyalty',    'label' => 'Referee Bonus Points'],
            ['key' => 'points_expiry_months',  'value' => '24',       'type' => 'number', 'group' => 'loyalty',    'label' => 'Points Expiry (Months)'],
            ['key' => 'points_per_currency',   'value' => '10',       'type' => 'number', 'group' => 'loyalty',    'label' => 'Points per Currency Unit'],
            ['key' => 'currency_symbol',       'value' => '€',        'type' => 'text',   'group' => 'general',    'label' => 'Currency Symbol'],
            // Appearance (brand colors) — needed for theme endpoint + branding UI
            ['key' => 'primary_color',        'value' => '#c9a84c', 'type' => 'string', 'group' => 'appearance', 'label' => 'Primary Color'],
            ['key' => 'secondary_color',      'value' => '#1e1e1e', 'type' => 'string', 'group' => 'appearance', 'label' => 'Secondary Color'],
            ['key' => 'accent_color',         'value' => '#32d74b', 'type' => 'string', 'group' => 'appearance', 'label' => 'Accent / Success'],
            ['key' => 'background_color',     'value' => '#0d0d0d', 'type' => 'string', 'group' => 'appearance', 'label' => 'Background'],
            ['key' => 'surface_color',        'value' => '#161616', 'type' => 'string', 'group' => 'appearance', 'label' => 'Surface / Card'],
            ['key' => 'text_color',           'value' => '#ffffff', 'type' => 'string', 'group' => 'appearance', 'label' => 'Text Color'],
            ['key' => 'text_secondary_color', 'value' => '#8e8e93', 'type' => 'string', 'group' => 'appearance', 'label' => 'Secondary Text'],
            ['key' => 'border_color',         'value' => '#2c2c2c', 'type' => 'string', 'group' => 'appearance', 'label' => 'Border Color'],
            ['key' => 'error_color',          'value' => '#ff375f', 'type' => 'string', 'group' => 'appearance', 'label' => 'Error / Danger'],
            ['key' => 'warning_color',        'value' => '#ffd60a', 'type' => 'string', 'group' => 'appearance', 'label' => 'Warning'],
            ['key' => 'info_color',           'value' => '#0a84ff', 'type' => 'string', 'group' => 'appearance', 'label' => 'Info'],
            ['key' => 'dark_mode_enabled',    'value' => 'true',    'type' => 'boolean','group' => 'appearance', 'label' => 'Dark Mode'],
        ];

        foreach ($defaults as $setting) {
            HotelSetting::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'key' => $setting['key']],
                $setting
            );
        }

        // Default basic rating form — gives every org a working review
        // URL out of the box; custom forms can be added later in admin.
        ReviewForm::withoutGlobalScopes()->firstOrCreate(
            ['organization_id' => $org->id, 'is_default' => true],
            [
                'name'       => 'Stay Feedback',
                'type'       => 'basic',
                'is_active'  => true,
                'embed_key'  => Str::random(32),
                'config'     => [
                    'intro_text'         => 'We hope you enjoyed your stay. Your feedback helps us improve.',
                    'thank_you_text'     => 'Thank you for taking the time to share your experience.',
                    'ask_for_comment'    => true,
                    'allow_anonymous'    => true,
                    'redirect_threshold' => 4,
                    'redirect_prompt'    => 'Would you share this on a review site?',
                ],
            ]
        );
    }

    /**
     * Populate an organization with sample/demo data.
     *
     * Wrapped in a transaction so a partial failure rolls back cleanly —
     * the Setup wizard can safely retry or the user can re-run the step.
     */
    public function seedSampleData(Organization $org): void
    {
        app()->instance('current_organization_id', $org->id);

        // Make sure default tiers exist even if the caller skipped setupDefaults.
        $this->setupDefaults($org);

        $bronzeTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Bronze')->first();
        $silverTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Silver')->first();
        $goldTier   = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Gold')->first();

        if (!$bronzeTier) {
            Log::warning('seedSampleData: tiers missing after setupDefaults — aborting', ['org_id' => $org->id]);
            return;
        }

        DB::transaction(function () use ($org, $bronzeTier, $silverTier, $goldTier) {
            $this->seedSampleMembers($org, $bronzeTier, $silverTier, $goldTier);
            $this->seedSampleGuests($org);
            $this->seedSampleOffers($org);
        });
    }

    protected function seedSampleMembers(Organization $org, LoyaltyTier $bronze, LoyaltyTier $silver, LoyaltyTier $gold): void
    {
        $members = [
            ['name' => 'Alice Johnson',  'tier' => $gold,   'points' => 7500],
            ['name' => 'Bob Smith',      'tier' => $silver, 'points' => 2200],
            ['name' => 'Carol Davis',    'tier' => $bronze, 'points' => 450],
            ['name' => 'David Wilson',   'tier' => $silver, 'points' => 1800],
            ['name' => 'Emma Brown',     'tier' => $gold,   'points' => 6200],
        ];

        foreach ($members as $sm) {
            $slug = Str::slug(explode(' ', $sm['name'])[0]);
            $email = "{$slug}.{$org->id}@sample.hotel-tech.ai";

            $user = User::withoutGlobalScopes()->firstOrCreate(
                ['email' => $email],
                [
                    'name'            => $sm['name'],
                    'password'        => Hash::make('password'),
                    'user_type'       => 'member',
                    'organization_id' => $org->id,
                ]
            );

            LoyaltyMember::withoutGlobalScopes()->firstOrCreate(
                ['user_id' => $user->id],
                [
                    'organization_id' => $org->id,
                    'tier_id'         => $sm['tier']->id,
                    'member_number'   => 'M' . str_pad((string) random_int(10000, 999999), 6, '0', STR_PAD_LEFT),
                    'qr_code_token'   => Str::random(64),
                    'referral_code'   => strtoupper(Str::random(8)),
                    'current_points'  => $sm['points'],
                    'lifetime_points' => $sm['points'] + random_int(500, 3000),
                    'is_active'       => true,
                    'joined_at'       => now()->subDays(random_int(30, 365)),
                    'last_activity_at'=> now()->subDays(random_int(1, 14)),
                ]
            );
        }
    }

    protected function seedSampleGuests(Organization $org): void
    {
        // vip_level values must match the column default space ('Standard', 'silver', 'gold').
        // NEVER pass explicit null — the column is NOT NULL. Omit the key instead so the
        // PG default ('Standard') fires when we want the baseline.
        $guests = [
            ['first_name' => 'James',   'last_name' => 'Anderson', 'email' => "james.{$org->id}@sample.hotel-tech.ai",   'vip_level' => 'gold',     'total_stays' => 12, 'total_revenue' => 15000],
            ['first_name' => 'Sophie',  'last_name' => 'Martin',   'email' => "sophie.{$org->id}@sample.hotel-tech.ai",  'vip_level' => 'silver',   'total_stays' => 5,  'total_revenue' => 6500],
            ['first_name' => 'Michael', 'last_name' => 'Chen',     'email' => "michael.{$org->id}@sample.hotel-tech.ai", 'vip_level' => 'Standard', 'total_stays' => 2,  'total_revenue' => 1800],
        ];

        foreach ($guests as $sg) {
            Guest::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'email' => $sg['email']],
                array_filter(array_merge($sg, [
                    'full_name'      => $sg['first_name'] . ' ' . $sg['last_name'],
                    'guest_type'     => 'Individual',
                    'lead_source'    => 'Sample Data',
                    'last_stay_date' => now()->subDays(random_int(5, 90)),
                    'first_stay_date'=> now()->subDays(random_int(180, 730)),
                    'email_consent'  => true,
                ]), fn($v) => $v !== null)
            );
        }
    }

    protected function seedSampleOffers(Organization $org): void
    {
        if (!class_exists(\App\Models\SpecialOffer::class)) return;

        $offers = [
            [
                'title'       => 'Welcome Getaway',
                'description' => '20% off your first weekend stay as a new loyalty member.',
                'type'        => 'percentage',
                'value'       => 20,
                'is_active'   => true,
                'is_featured' => true,
                'start_date'  => now()->subDays(3),
                'end_date'    => now()->addDays(60),
            ],
            [
                'title'       => 'Spa Indulgence',
                'description' => 'Complimentary 30-min massage upgrade with any spa booking.',
                'type'        => 'complimentary',
                'is_active'   => true,
                'start_date'  => now()->subDays(1),
                'end_date'    => now()->addDays(90),
            ],
        ];

        foreach ($offers as $o) {
            try {
                \App\Models\SpecialOffer::withoutGlobalScopes()->firstOrCreate(
                    ['organization_id' => $org->id, 'title' => $o['title']],
                    array_filter($o, fn($v) => $v !== null)
                );
            } catch (\Throwable $e) {
                // Non-fatal — offers are a nice-to-have on sample data.
                Log::warning('seedSampleOffers: could not create offer', [
                    'org_id' => $org->id,
                    'title'  => $o['title'],
                    'error'  => $e->getMessage(),
                ]);
            }
        }
    }
}
