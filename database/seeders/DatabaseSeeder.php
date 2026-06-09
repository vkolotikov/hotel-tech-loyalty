<?php

namespace Database\Seeders;

use App\Models\Organization;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Every seeder below writes tenant-scoped data (loyalty tiers, benefits,
        // tier-benefit assignments, hotel settings, demo members/staff/bookings).
        // Those models use the BelongsToOrganization trait, which stamps
        // organization_id from `current_organization_id` on create and hides
        // rows from other orgs (fail-closed TenantScope). Without binding the
        // org context up front, tiers/benefits get organization_id = NULL and
        // become invisible to the org-scoped queries the later seeders run —
        // exactly why DemoDataSeeder couldn't find the 'Diamond' tier.
        $org = Organization::first();
        if ($org) {
            app()->instance('current_organization_id', $org->id);
        }

        $this->call([
            LoyaltyTierSeeder::class,
            BenefitSeeder::class,
            DemoDataSeeder::class,
            HotelSettingsSeeder::class,
        ]);
    }
}
