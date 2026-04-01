<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Models\SpecialOffer;
use App\Models\Staff;
use App\Models\User;
use App\Services\QrCodeService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoDataSeeder extends Seeder
{
    public function __construct(protected QrCodeService $qrService) {}

    public function run(): void
    {
        // Bind org context so fail-closed TenantScope allows queries
        $org = \App\Models\Organization::first();
        if (!$org) {
            $this->command->error('No organization found. Run the organization seeder first.');
            return;
        }
        app()->instance('current_organization_id', $org->id);

        $tiers = LoyaltyTier::orderBy('min_points')->get()->keyBy('name');

        // ─── Admin Staff User ──────────────────────────────────────────────────
        $adminUser = User::updateOrCreate(
            ['email' => 'info@hotel-tech.ai'],
            [
                'name'      => 'Super Admin',
                'password'  => Hash::make('First-Design-Studio'),
                'user_type' => 'staff',
            ]
        );

        Staff::updateOrCreate(
            ['user_id' => $adminUser->id],
            [
                'role'               => 'super_admin',
                'hotel_name'         => 'Grand Hotel',
                'can_award_points'   => true,
                'can_redeem_points'  => true,
                'can_manage_offers'  => true,
                'can_view_analytics' => true,
                'is_active'          => true,
            ]
        );

        // Receptionist
        $receptionUser = User::updateOrCreate(
            ['email' => 'user@hotel-tech.ai'],
            [
                'name'      => 'Regular User',
                'password'  => Hash::make('First-Design-Studio'),
                'user_type' => 'staff',
            ]
        );

        Staff::updateOrCreate(['user_id' => $receptionUser->id], [
            'role' => 'receptionist',
            'hotel_name' => 'Grand Hotel',
            'can_award_points' => true,
            'can_redeem_points' => true,
        ]);

        $this->command->info('✓ Staff users created');

        // ─── Demo Members ──────────────────────────────────────────────────────
        $demoMembers = [
            ['name' => 'Alice Johnson', 'email' => 'alice@demo.com', 'tier' => 'Diamond', 'lifetime' => 75000, 'current' => 12500],
            ['name' => 'Bob Martinez',  'email' => 'bob@demo.com',   'tier' => 'Platinum','lifetime' => 22000, 'current' => 8200],
            ['name' => 'Carol Smith',   'email' => 'carol@demo.com', 'tier' => 'Gold',    'lifetime' => 9500,  'current' => 3100],
            ['name' => 'David Lee',     'email' => 'david@demo.com', 'tier' => 'Silver',  'lifetime' => 2800,  'current' => 1200],
            ['name' => 'Emma Wilson',   'email' => 'emma@demo.com',  'tier' => 'Bronze',  'lifetime' => 450,   'current' => 450],
        ];

        foreach ($demoMembers as $dm) {
            $user = User::firstOrCreate(
                ['email' => $dm['email']],
                [
                    'name'      => $dm['name'],
                    'password'  => Hash::make('First-Design-Studio'),
                    'phone'     => '+1' . rand(2000000000, 9999999999),
                    'user_type' => 'member',
                ]
            );

            if ($user->loyaltyMember) continue;

            $tier = $tiers[$dm['tier']];
            $member = LoyaltyMember::create([
                'user_id'        => $user->id,
                'member_number'  => $this->qrService->generateMemberNumber(),
                'tier_id'        => $tier->id,
                'lifetime_points'=> $dm['lifetime'],
                'current_points' => $dm['current'],
                'qr_code_token'  => hash_hmac('sha256', $user->id . Str::random(16), config('app.key')),
                'referral_code'  => $this->qrService->generateReferralCode(),
                'joined_at'      => now()->subMonths(rand(1, 24)),
                'last_activity_at' => now()->subDays(rand(1, 30)),
                'points_expiry_date' => now()->addYear(),
                'is_active'      => true,
            ]);

            // Add some transaction history
            PointsTransaction::create([
                'member_id'    => $member->id,
                'type'         => 'earn',
                'points'       => $dm['lifetime'] - 500,
                'balance_after'=> $dm['current'],
                'description'  => 'Historical stays and activity',
            ]);

            PointsTransaction::create([
                'member_id'    => $member->id,
                'type'         => 'bonus',
                'points'       => 500,
                'balance_after'=> $dm['current'],
                'description'  => 'Welcome bonus',
            ]);

            // Add sample bookings
            for ($i = 0; $i < rand(1, 5); $i++) {
                $checkIn = now()->subDays(rand(10, 365));
                Booking::create([
                    'member_id'         => $member->id,
                    'booking_reference' => 'BK-' . strtoupper(Str::random(8)),
                    'hotel_name'        => 'Grand Hotel',
                    'room_type'         => collect(['Standard', 'Deluxe', 'Suite', 'Junior Suite'])->random(),
                    'check_in'          => $checkIn,
                    'check_out'         => $checkIn->copy()->addDays(rand(1, 7)),
                    'nights'            => rand(1, 7),
                    'total_amount'      => rand(150, 2000),
                    'currency'          => 'USD',
                    'status'            => 'checked_out',
                    'points_earned'     => rand(100, 2000),
                    'rating'            => rand(3, 5),
                ]);
            }
        }

        $this->command->info('✓ Demo members seeded');

        // ─── Sample Offers ─────────────────────────────────────────────────────
        $offers = [
            [
                'title'       => 'Summer Splash — 20% Off All Stays',
                'description' => 'Enjoy 20% off room rates throughout the summer season.',
                'type'        => 'discount',
                'value'       => 20,
                'tier_ids'    => null,
                'start_date'  => now()->subDays(5),
                'end_date'    => now()->addDays(60),
                'is_featured' => true,
                'is_active'   => true,
            ],
            [
                'title'       => 'Double Points Weekend',
                'description' => 'Earn 2x points on all stays this weekend.',
                'type'        => 'points_multiplier',
                'value'       => 2,
                'tier_ids'    => [1, 2],
                'start_date'  => now(),
                'end_date'    => now()->addDays(3),
                'is_featured' => true,
                'is_active'   => true,
            ],
            [
                'title'       => 'Gold & Above: Complimentary Spa',
                'description' => 'Gold, Platinum and Diamond members receive a complimentary 60-min spa session.',
                'type'        => 'upgrade',
                'value'       => 1,
                'tier_ids'    => [3, 4, 5],
                'start_date'  => now(),
                'end_date'    => now()->addDays(30),
                'is_featured' => false,
                'is_active'   => true,
            ],
            [
                'title'       => '500 Bonus Points on First Spa Visit',
                'description' => 'Earn 500 bonus points on your first spa visit this quarter.',
                'type'        => 'bonus_points',
                'value'       => 500,
                'tier_ids'    => null,
                'start_date'  => now(),
                'end_date'    => now()->addDays(90),
                'is_featured' => false,
                'is_active'   => true,
            ],
        ];

        foreach ($offers as $offerData) {
            SpecialOffer::create(array_merge($offerData, [
                'created_by' => $adminUser->id,
            ]));
        }

        $this->command->info('✓ Sample offers seeded');
        $this->command->info('');
        $this->command->info('── Login Credentials ────────────────────────────────');
        $this->command->info('Admin:  info@hotel-tech.ai / First-Design-Studio');
        $this->command->info('User:   user@hotel-tech.ai / First-Design-Studio');
        $this->command->info('Member: alice@demo.com / First-Design-Studio (Diamond)');
        $this->command->info('─────────────────────────────────────────────────────');
    }
}
