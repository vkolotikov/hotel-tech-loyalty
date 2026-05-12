<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user section access — Settings → Team feature.
 *
 * Pre-fix sidebar visibility was an ORG-wide setting (Settings →
 * Menu / crm_settings.hidden_nav_groups). Every staff member in
 * the org saw the same menu. Customers wanted per-user access:
 * a front-desk staffer only sees Bookings; a marketing staffer
 * only sees CRM & Marketing; etc.
 *
 * `allowed_nav_groups` is a JSON whitelist of group labels. NULL
 * means "no per-user restriction" — the user sees whatever the
 * org-level hidden_nav_groups setting allows (full backwards
 * compat with rows pre-dating this migration).
 *
 * Super_admin / manager role always sees everything regardless
 * of this list — enforced in Layout.tsx and re-asserted in the
 * Team controller's update path.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('staff') && !Schema::hasColumn('staff', 'allowed_nav_groups')) {
            Schema::table('staff', function (Blueprint $t) {
                $t->json('allowed_nav_groups')->nullable()->after('can_view_analytics');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('staff') && Schema::hasColumn('staff', 'allowed_nav_groups')) {
            Schema::table('staff', function (Blueprint $t) {
                $t->dropColumn('allowed_nav_groups');
            });
        }
    }
};
