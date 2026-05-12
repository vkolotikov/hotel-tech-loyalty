<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two unrelated-but-shipped-together columns on `loyalty_members`.
 *
 * 1. `tier_override_until` — when an admin sets the member's tier from
 *    the admin SPA they almost always mean "give them Platinum for the
 *    rest of this stay" or "let them keep Gold through their birthday".
 *    Pre-fix the assessTier cron would immediately downgrade them the
 *    next time it ran. With this column set, assessTier skips
 *    downgrades while it's in the future. NULL = behave as today.
 *
 * 2. `notification_preferences` — categorised opt-in (offers / points /
 *    tier / stays / transactional). Replaces the single global
 *    push_notifications boolean for fine-grained control. The boolean
 *    stays as a master kill-switch — when it's off, no category fires.
 *    JSONB so member-app toggles can be persisted without a migration
 *    every time we add a new category.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_members', function (Blueprint $t) {
            if (!Schema::hasColumn('loyalty_members', 'tier_override_until')) {
                $t->timestamp('tier_override_until')->nullable();
            }
            if (!Schema::hasColumn('loyalty_members', 'notification_preferences')) {
                // Postgres jsonb. Default null = "use the global push_notifications
                // boolean for every category" (back-compat).
                $t->jsonb('notification_preferences')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_members', function (Blueprint $t) {
            if (Schema::hasColumn('loyalty_members', 'notification_preferences')) {
                $t->dropColumn('notification_preferences');
            }
            if (Schema::hasColumn('loyalty_members', 'tier_override_until')) {
                $t->dropColumn('tier_override_until');
            }
        });
    }
};
