<?php

namespace Database\Seeders;

use App\Models\BenefitDefinition;
use App\Models\LoyaltyTier;
use App\Models\TierBenefit;
use Illuminate\Database\Seeder;

class BenefitSeeder extends Seeder
{
    public function run(): void
    {
        // ─── Benefit Definitions ─────────────────────────────────────────────
        $benefits = [
            [
                'code'             => 'early_checkin',
                'name'             => 'Early Check-in',
                'description'      => 'Check in before the standard time, subject to availability',
                'category'         => 'accommodation',
                'fulfillment_mode' => 'staff_approved',
                'sort_order'       => 1,
            ],
            [
                'code'             => 'late_checkout',
                'name'             => 'Late Checkout',
                'description'      => 'Extend your checkout beyond the standard time',
                'category'         => 'accommodation',
                'fulfillment_mode' => 'staff_approved',
                'sort_order'       => 2,
            ],
            [
                'code'             => 'room_upgrade',
                'name'             => 'Room Upgrade',
                'description'      => 'Complimentary upgrade to the next room category',
                'category'         => 'accommodation',
                'fulfillment_mode' => 'staff_approved',
                'sort_order'       => 3,
            ],
            [
                'code'             => 'suite_upgrade',
                'name'             => 'Suite Upgrade',
                'description'      => 'Complimentary upgrade to a suite when available',
                'category'         => 'accommodation',
                'fulfillment_mode' => 'staff_approved',
                'sort_order'       => 4,
            ],
            [
                'code'             => 'fb_discount',
                'name'             => 'Food & Beverage Discount',
                'description'      => 'Discount on all food and beverage outlets',
                'category'         => 'dining',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 5,
            ],
            [
                'code'             => 'complimentary_breakfast',
                'name'             => 'Complimentary Breakfast',
                'description'      => 'Daily complimentary breakfast during your stay',
                'category'         => 'dining',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 6,
            ],
            [
                'code'             => 'welcome_drink',
                'name'             => 'Welcome Drink',
                'description'      => 'Complimentary welcome drink upon arrival',
                'category'         => 'dining',
                'fulfillment_mode' => 'voucher',
                'sort_order'       => 7,
            ],
            [
                'code'             => 'minibar_complimentary',
                'name'             => 'Complimentary Minibar',
                'description'      => 'Enjoy a fully stocked minibar at no charge',
                'category'         => 'dining',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 8,
            ],
            [
                'code'             => 'spa_access',
                'name'             => 'Spa & Wellness Access',
                'description'      => 'Complimentary access to spa and wellness facilities',
                'category'         => 'wellness',
                'fulfillment_mode' => 'on_request',
                'sort_order'       => 9,
            ],
            [
                'code'             => 'spa_discount',
                'name'             => 'Spa Treatment Discount',
                'description'      => 'Discount on spa treatments and services',
                'category'         => 'wellness',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 10,
            ],
            [
                'code'             => 'airport_transfer',
                'name'             => 'Airport Transfer',
                'description'      => 'Complimentary airport transfer service',
                'category'         => 'transport',
                'fulfillment_mode' => 'on_request',
                'sort_order'       => 11,
            ],
            [
                'code'             => 'lounge_access',
                'name'             => 'Lounge Access',
                'description'      => 'Access to the exclusive members lounge',
                'category'         => 'access',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 12,
            ],
            [
                'code'             => 'priority_checkin',
                'name'             => 'Priority Check-in',
                'description'      => 'Dedicated priority check-in desk for faster service',
                'category'         => 'accommodation',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 13,
            ],
            [
                'code'             => 'dedicated_manager',
                'name'             => 'Dedicated Relationship Manager',
                'description'      => 'A personal relationship manager for all your needs',
                'category'         => 'recognition',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 14,
            ],
            [
                'code'             => 'birthday_bonus',
                'name'             => 'Birthday Bonus Points',
                'description'      => 'Bonus loyalty points awarded on your birthday',
                'category'         => 'points',
                'fulfillment_mode' => 'automatic',
                'sort_order'       => 15,
            ],
            [
                'code'             => 'bonus_nights',
                'name'             => 'Complimentary Bonus Nights',
                'description'      => 'Complimentary nights awarded per year based on tier',
                'category'         => 'accommodation',
                'fulfillment_mode' => 'on_request',
                'sort_order'       => 16,
            ],
        ];

        foreach ($benefits as $benefit) {
            BenefitDefinition::updateOrCreate(
                ['code' => $benefit['code']],
                array_merge($benefit, ['is_active' => true])
            );
        }

        // ─── Tier-Benefit Assignments ────────────────────────────────────────
        // Map: tier name => [ code => value ]
        $tierAssignments = [
            'Bronze' => [
                'early_checkin'   => 'Subject to availability',
                'fb_discount'     => '5%',
                'welcome_drink'   => '1 per stay',
                'birthday_bonus'  => '100 points',
            ],
            'Silver' => [
                'early_checkin'           => 'Subject to availability',
                'late_checkout'           => '2:00 PM',
                'room_upgrade'            => 'Subject to availability',
                'fb_discount'             => '10%',
                'complimentary_breakfast'  => 'Daily',
                'welcome_drink'           => '1 per stay',
                'birthday_bonus'          => '250 points',
                'bonus_nights'            => '1 per year',
            ],
            'Gold' => [
                'early_checkin'           => 'Guaranteed',
                'late_checkout'           => '4:00 PM',
                'room_upgrade'            => 'Guaranteed',
                'fb_discount'             => '15%',
                'complimentary_breakfast'  => 'Daily',
                'welcome_drink'           => '1 per stay',
                'spa_access'              => '1 hour per stay',
                'spa_discount'            => '10%',
                'priority_checkin'        => 'Yes',
                'birthday_bonus'          => '500 points',
                'bonus_nights'            => '2 per year',
            ],
            'Platinum' => [
                'early_checkin'           => 'Guaranteed',
                'late_checkout'           => '6:00 PM',
                'room_upgrade'            => 'Guaranteed',
                'suite_upgrade'           => 'Subject to availability',
                'fb_discount'             => '20%',
                'complimentary_breakfast'  => 'Daily',
                'welcome_drink'           => '2 per stay',
                'spa_access'              => 'Full access per stay',
                'spa_discount'            => '15%',
                'airport_transfer'        => 'One way',
                'lounge_access'           => 'Yes',
                'priority_checkin'        => 'Yes',
                'dedicated_manager'       => 'Yes',
                'birthday_bonus'          => '1000 points',
                'bonus_nights'            => '4 per year',
            ],
            'Diamond' => [
                'early_checkin'           => 'Guaranteed',
                'late_checkout'           => 'Anytime',
                'room_upgrade'            => 'Guaranteed',
                'suite_upgrade'           => 'Guaranteed',
                'fb_discount'             => '25%',
                'complimentary_breakfast'  => 'All-inclusive dining',
                'welcome_drink'           => 'Unlimited',
                'minibar_complimentary'   => 'Fully stocked',
                'spa_access'              => 'Full access',
                'spa_discount'            => '20%',
                'airport_transfer'        => 'Both ways',
                'lounge_access'           => 'Exclusive Diamond lounge',
                'priority_checkin'        => 'Yes',
                'dedicated_manager'       => 'Yes',
                'birthday_bonus'          => '2500 points',
                'bonus_nights'            => '7 per year',
            ],
        ];

        // Cache benefit IDs by code
        $benefitIds = BenefitDefinition::pluck('id', 'code');

        foreach ($tierAssignments as $tierName => $assignedBenefits) {
            $tier = LoyaltyTier::where('name', $tierName)->first();
            if (!$tier) {
                continue;
            }

            foreach ($assignedBenefits as $code => $value) {
                if (!isset($benefitIds[$code])) {
                    continue;
                }

                TierBenefit::updateOrCreate(
                    [
                        'tier_id'     => $tier->id,
                        'benefit_id'  => $benefitIds[$code],
                        'property_id' => null,
                    ],
                    [
                        'value'     => $value,
                        'is_active' => true,
                    ]
                );
            }
        }

        $this->command->info('Benefit definitions and tier assignments seeded successfully.');
    }
}
