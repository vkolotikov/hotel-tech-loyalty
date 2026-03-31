<?php

namespace App\Services;

use App\Models\BenefitDefinition;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\Property;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
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
            ['key' => 'hotel_name',            'value' => $org->name, 'type' => 'text',   'group' => 'general',  'label' => 'Hotel Name'],
            ['key' => 'welcome_bonus_points',  'value' => '500',      'type' => 'number', 'group' => 'loyalty',  'label' => 'Welcome Bonus Points'],
            ['key' => 'referrer_bonus_points', 'value' => '250',      'type' => 'number', 'group' => 'loyalty',  'label' => 'Referrer Bonus Points'],
            ['key' => 'referee_bonus_points',  'value' => '250',      'type' => 'number', 'group' => 'loyalty',  'label' => 'Referee Bonus Points'],
            ['key' => 'points_expiry_months',  'value' => '24',       'type' => 'number', 'group' => 'loyalty',  'label' => 'Points Expiry (Months)'],
            ['key' => 'points_per_currency',   'value' => '10',       'type' => 'number', 'group' => 'loyalty',  'label' => 'Points per Currency Unit'],
            ['key' => 'currency_symbol',       'value' => '€',        'type' => 'text',   'group' => 'general',  'label' => 'Currency Symbol'],
        ];

        foreach ($defaults as $setting) {
            HotelSetting::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'key' => $setting['key']],
                $setting
            );
        }
    }

    /**
     * Populate an organization with sample/demo data.
     */
    public function seedSampleData(Organization $org): void
    {
        app()->instance('current_organization_id', $org->id);

        $bronzeTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Bronze')->first();
        $silverTier = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Silver')->first();
        $goldTier   = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $org->id)->where('name', 'Gold')->first();

        if (!$bronzeTier) return;

        $sampleMembers = [
            ['name' => 'Alice Johnson',  'email' => "alice.{$org->id}@sample.hotel-tech.ai",  'tier' => $goldTier,   'points' => 7500],
            ['name' => 'Bob Smith',      'email' => "bob.{$org->id}@sample.hotel-tech.ai",    'tier' => $silverTier, 'points' => 2200],
            ['name' => 'Carol Davis',    'email' => "carol.{$org->id}@sample.hotel-tech.ai",  'tier' => $bronzeTier, 'points' => 450],
            ['name' => 'David Wilson',   'email' => "david.{$org->id}@sample.hotel-tech.ai",  'tier' => $silverTier, 'points' => 1800],
            ['name' => 'Emma Brown',     'email' => "emma.{$org->id}@sample.hotel-tech.ai",   'tier' => $goldTier,   'points' => 6200],
        ];

        foreach ($sampleMembers as $sm) {
            $user = User::withoutGlobalScopes()->firstOrCreate(
                ['email' => $sm['email']],
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
                    'member_number'   => 'M' . str_pad(random_int(10000, 99999), 6, '0'),
                    'qr_code_token'   => Str::random(64),
                    'referral_code'   => strtoupper(Str::random(8)),
                    'current_points'  => $sm['points'],
                    'lifetime_points' => $sm['points'] + random_int(500, 3000),
                    'is_active'       => true,
                    'joined_at'       => now()->subDays(random_int(30, 365)),
                ]
            );
        }

        $sampleGuests = [
            ['first_name' => 'James',   'last_name' => 'Anderson', 'email' => 'james.a@example.com',   'vip_level' => 'gold',   'total_stays' => 12, 'total_revenue' => 15000],
            ['first_name' => 'Sophie',  'last_name' => 'Martin',   'email' => 'sophie.m@example.com',  'vip_level' => 'silver', 'total_stays' => 5,  'total_revenue' => 6500],
            ['first_name' => 'Michael', 'last_name' => 'Chen',     'email' => 'michael.c@example.com', 'vip_level' => null,     'total_stays' => 2,  'total_revenue' => 1800],
        ];

        foreach ($sampleGuests as $sg) {
            Guest::withoutGlobalScopes()->firstOrCreate(
                ['organization_id' => $org->id, 'email' => $sg['email']],
                array_merge($sg, [
                    'guest_type'     => 'individual',
                    'source'         => 'sample',
                    'last_stay_date' => now()->subDays(random_int(5, 90)),
                ])
            );
        }
    }
}
