<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill organizations created before the subscription model fix.
        // Give them a 7-day trial with full features so they're not blocked.
        $orgs = DB::table('organizations')
            ->whereNull('subscription_status')
            ->get();

        foreach ($orgs as $org) {
            DB::table('organizations')
                ->where('id', $org->id)
                ->update([
                    'plan_slug'           => 'starter',
                    'subscription_status' => 'TRIALING',
                    'trial_end'           => now()->addDays(7),
                    'period_end'          => now()->addDays(7),
                    'entitled_products'   => json_encode(['crm', 'chat', 'loyalty', 'booking']),
                    'plan_features'       => json_encode([
                        'max_team_members'    => 'unlimited',
                        'max_guests'          => 'unlimited',
                        'max_properties'      => 'unlimited',
                        'max_loyalty_members' => 'unlimited',
                        'ai_insights'         => 'true',
                        'ai_avatars'          => 'true',
                        'custom_branding'     => 'true',
                        'api_access'          => 'true',
                        'push_notifications'  => 'true',
                        'mobile_app'          => 'true',
                        'nfc_cards'           => 'true',
                        'priority_support'    => 'dedicated',
                    ]),
                    'entitlements_synced_at' => now(),
                    'updated_at'            => now(),
                ]);
        }
    }

    public function down(): void
    {
        // Cannot reliably reverse — these orgs had NULL before
    }
};
