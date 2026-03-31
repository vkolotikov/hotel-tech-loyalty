<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add organization_id to all tables that need multi-tenancy scoping.
 * Tables already linked via property_id→organization_id are also given
 * a direct organization_id for faster queries without joins.
 */
return new class extends Migration
{
    public function up(): void
    {
        $tables = [
            'users',
            'loyalty_tiers',
            'loyalty_members',
            'points_transactions',
            'bookings',
            'special_offers',
            'nfc_cards',
            'notification_campaigns',
            'referrals',
            'audit_logs',
            'benefit_definitions',
            'tier_benefits',
            'benefit_entitlements',
            'member_identities',
            'campaign_segments',
            'scan_events',
            'guests',
            'corporate_accounts',
            'inquiries',
            'reservations',
            'venues',
            'venue_bookings',
            'planner_tasks',
            'planner_subtasks',
            'hotel_settings',
            'email_templates',
            'realtime_events',
            'ai_conversations',
            'analytics_events',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, 'organization_id')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->unsignedBigInteger('organization_id')->nullable()->after('id');
                    $t->index('organization_id');
                });
            }
        }

        // Add saas_org_id to organizations for SaaS platform linking
        if (Schema::hasTable('organizations') && !Schema::hasColumn('organizations', 'saas_org_id')) {
            Schema::table('organizations', function (Blueprint $t) {
                $t->string('saas_org_id')->nullable()->unique()->after('id');
            });
        }
    }

    public function down(): void
    {
        $tables = [
            'users', 'loyalty_tiers', 'loyalty_members', 'points_transactions',
            'bookings', 'special_offers', 'nfc_cards', 'notification_campaigns',
            'referrals', 'audit_logs', 'benefit_definitions', 'tier_benefits',
            'benefit_entitlements', 'member_identities', 'campaign_segments',
            'scan_events', 'guests', 'corporate_accounts', 'inquiries',
            'reservations', 'venues', 'venue_bookings', 'planner_tasks',
            'planner_subtasks', 'hotel_settings', 'email_templates',
            'realtime_events', 'ai_conversations', 'analytics_events',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'organization_id')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropIndex(['organization_id']);
                    $t->dropColumn('organization_id');
                });
            }
        }
    }
};
