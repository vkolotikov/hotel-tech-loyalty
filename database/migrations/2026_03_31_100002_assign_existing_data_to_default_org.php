<?php

use App\Models\Organization;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Assign all existing data (created before multi-tenancy) to a default organization.
 * This ensures existing single-tenant installs continue to work.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Create a default organization for existing data
        $org = Organization::firstOrCreate(
            ['slug' => 'default'],
            [
                'name'      => 'My Hotel',
                'is_active' => true,
            ]
        );

        $tables = [
            'users', 'loyalty_tiers', 'loyalty_members', 'points_transactions',
            'bookings', 'special_offers', 'nfc_cards', 'notification_campaigns',
            'referrals', 'audit_logs', 'benefit_definitions', 'tier_benefits',
            'benefit_entitlements', 'member_identities', 'campaign_segments',
            'scan_events', 'guests', 'corporate_accounts', 'inquiries',
            'reservations', 'venues', 'venue_bookings', 'planner_tasks',
            'planner_subtasks', 'hotel_settings', 'email_templates',
            'realtime_events', 'ai_conversations', 'analytics_events',
            'staff',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'organization_id')) {
                DB::table($table)
                    ->whereNull('organization_id')
                    ->update(['organization_id' => $org->id]);
            }
        }

        // Also assign properties without organization_id
        if (Schema::hasTable('properties')) {
            DB::table('properties')
                ->whereNull('organization_id')
                ->update(['organization_id' => $org->id]);
        }
    }

    public function down(): void
    {
        // Not reversible — data assignment is permanent
    }
};
