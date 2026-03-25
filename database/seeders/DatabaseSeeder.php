<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            LoyaltyTierSeeder::class,
            BenefitSeeder::class,
            DemoDataSeeder::class,
            HotelSettingsSeeder::class,
        ]);
    }
}
