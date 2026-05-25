<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Relaxes the global UNIQUE on users.email so the same email can be:
    //  - a staff member at multiple organizations (the "consultant works
    //    front-desk at hotel A *and* hotel B" case), AND
    //  - a member at one org + a staff at another org (staff at hotel A,
    //    member at hotel B).
    //
    // Replaces the single global unique with two partial uniques:
    //
    //  - users_email_member_unique → globally unique by email
    //    WHERE user_type = 'member'.  Preserves the loyalty mobile app's
    //    auth flow which looks up members by email alone.
    //
    //  - users_email_staff_org_unique → unique by (organization_id, email)
    //    WHERE user_type = 'staff'.  Allows multi-org staff while still
    //    preventing duplicate staff rows inside a single org (which was
    //    the actual bug — re-inviting a teammate after they were deleted
    //    in SaaS but the local users row lingered, blowing 23505 on the
    //    fresh insert).
    //
    // No data migration needed — every existing users row has a single
    // organization_id, and the previous global-unique guaranteed no
    // email collisions within OR across orgs.  Both partials are
    // automatically satisfiable from the current state.
    public function up(): void
    {
        // Drop the legacy global unique. Laravel auto-named it
        // `users_email_unique` per the original 2014 migration.
        Schema::table('users', function (Blueprint $t) {
            $t->dropUnique('users_email_unique');
        });

        // Members: globally unique by email. The mobile app's login flow
        // (POST /v1/auth/login) looks up by email alone; allowing
        // duplicate member rows would make that lookup ambiguous.
        DB::statement(
            "CREATE UNIQUE INDEX users_email_member_unique
             ON users (email)
             WHERE user_type = 'member'"
        );

        // Staff: unique per (org, email). Same person can be staff at
        // multiple orgs (their JWT carries the org context, so the
        // SaasAuthMiddleware lookup can disambiguate).
        DB::statement(
            "CREATE UNIQUE INDEX users_email_staff_org_unique
             ON users (organization_id, email)
             WHERE user_type = 'staff'"
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_email_member_unique');
        DB::statement('DROP INDEX IF EXISTS users_email_staff_org_unique');

        // Rollback recreates the global unique. This will FAIL if
        // multi-org staff rows exist (which is the whole point of this
        // migration). Document the manual cleanup needed in that case.
        Schema::table('users', function (Blueprint $t) {
            $t->unique('email');
        });
    }
};
