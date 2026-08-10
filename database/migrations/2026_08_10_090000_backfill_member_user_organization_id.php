<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Give every member's user row the organisation its membership already has.
 *
 * `MemberAdminController::store()` and `bulkImport()` both created the
 * `users` row without `organization_id`. `User` does not carry the
 * `BelongsToOrganization` trait (it is the tenant identity model, not a
 * tenant-scoped child), so nothing filled the gap.
 *
 * The failure is invisible from the admin side. `LoyaltyMember` gets its
 * `organization_id` correctly, so the Members list, the KPI tiles and the
 * tier pills all look healthy — while the member themself authenticates
 * fine (login bypasses the scope) and then hits a `TenantScope` that fails
 * closed on every `/v1/member/*` route. The customer experiences it as
 * "the app is empty"; the operator sees nothing wrong at all.
 *
 * The membership row is the authority here: it is the record that has been
 * correctly org-stamped all along.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('loyalty_members')) {
            return;
        }
        if (!Schema::hasColumn('users', 'organization_id')
            || !Schema::hasColumn('loyalty_members', 'organization_id')) {
            return;
        }

        $before = DB::table('users')
            ->where('user_type', 'member')
            ->whereNull('organization_id')
            ->count();

        if ($before === 0) {
            return;
        }

        DB::statement("
            UPDATE users u
               SET organization_id = m.organization_id
              FROM loyalty_members m
             WHERE m.user_id = u.id
               AND u.organization_id IS NULL
               AND m.organization_id IS NOT NULL
        ");

        $after = DB::table('users')
            ->where('user_type', 'member')
            ->whereNull('organization_id')
            ->count();

        Log::info('backfill_member_user_organization_id', [
            'members_locked_out_before' => $before,
            'repaired'                  => $before - $after,
            // Remainder = member users whose membership row is itself
            // un-orgd, or who have no membership row at all.
            'still_null'                => $after,
        ]);
    }

    public function down(): void
    {
        // Irreversible by design — re-nulling would lock these members
        // out of the app again.
    }
};
