<?php

namespace Database\Seeders;

use App\Models\LoyaltyTier;
use Illuminate\Database\Seeder;

class LoyaltyTierSeeder extends Seeder
{
    public function run(): void
    {
        $tiers = [
            [
                'name'         => 'Bronze',
                'min_points'   => 0,
                'max_points'   => 999,
                'earn_rate'    => 1.00,
                'bonus_nights' => 0,
                'color_hex'    => '#CD7F32',
                'icon'         => 'award',
                'sort_order'   => 1,
                'perks'        => [
                    '5% discount on F&B',
                    'Early check-in (subject to availability)',
                    'Birthday bonus points (100)',
                    'Member-only rates',
                ],
            ],
            [
                'name'         => 'Silver',
                'min_points'   => 1000,
                'max_points'   => 4999,
                'earn_rate'    => 1.25,
                'bonus_nights' => 1,
                'color_hex'    => '#C0C0C0',
                'icon'         => 'star',
                'sort_order'   => 2,
                'perks'        => [
                    '10% discount on F&B',
                    'Room upgrade (subject to availability)',
                    'Late checkout (2:00 PM)',
                    'Birthday bonus points (250)',
                    'Complimentary amenity kit',
                    '1 complimentary night per year',
                ],
            ],
            [
                'name'         => 'Gold',
                'min_points'   => 5000,
                'max_points'   => 14999,
                'earn_rate'    => 1.50,
                'bonus_nights' => 2,
                'color_hex'    => '#FFD700',
                'icon'         => 'crown',
                'sort_order'   => 3,
                'perks'        => [
                    '15% discount on all services',
                    'Guaranteed room upgrade',
                    'Complimentary breakfast daily',
                    'Spa access (1 hour per stay)',
                    'Late checkout (4:00 PM)',
                    'Birthday bonus points (500)',
                    'Priority check-in desk',
                    '2 complimentary nights per year',
                ],
            ],
            [
                'name'         => 'Platinum',
                'min_points'   => 15000,
                'max_points'   => 49999,
                'earn_rate'    => 2.00,
                'bonus_nights' => 4,
                'color_hex'    => '#E5E4E2',
                'icon'         => 'gem',
                'sort_order'   => 4,
                'perks'        => [
                    '20% discount on all services',
                    'Suite upgrade on availability',
                    'Complimentary breakfast & dinner',
                    'Full spa access per stay',
                    'Airport transfer (one way)',
                    'Late checkout (6:00 PM)',
                    'Dedicated relationship manager',
                    'Birthday bonus points (1000)',
                    '4 complimentary nights per year',
                    'Priority lounge access',
                ],
            ],
            [
                'name'         => 'Diamond',
                'min_points'   => 50000,
                'max_points'   => null,
                'earn_rate'    => 3.00,
                'bonus_nights' => 7,
                'color_hex'    => '#B9F2FF',
                'icon'         => 'diamond',
                'sort_order'   => 5,
                'perks'        => [
                    '25% discount on all services',
                    'Guaranteed suite',
                    'All-inclusive dining',
                    'Full spa & wellness access',
                    'Airport transfer (both ways)',
                    'Private butler service',
                    'Late checkout (anytime)',
                    'Birthday bonus points (2500)',
                    '7 complimentary nights per year',
                    'Exclusive Diamond lounge',
                    'Complimentary minibar',
                    'Personal concierge 24/7',
                ],
            ],
        ];

        foreach ($tiers as $tier) {
            LoyaltyTier::updateOrCreate(['name' => $tier['name']], $tier);
        }

        $this->command->info('✓ Loyalty tiers seeded: Bronze, Silver, Gold, Platinum, Diamond');
    }
}
