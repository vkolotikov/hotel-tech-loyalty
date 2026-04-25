<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds a `welcomed_at` timestamp to `loyalty_members` so we can avoid
 * re-sending the "set your password / activate membership" email every
 * time an existing member books another stay or service.
 *
 * Whenever any flow sends a membership-welcome email (admin-created
 * member, booking auto-enroll, service booking auto-enroll, manual
 * resend), it stamps this column. Subsequent flows skip the welcome
 * email when this is non-null.
 *
 * Backfill: pre-existing members whose users already have an
 * `email_verified_at` are stamped with that timestamp — they've clearly
 * been onboarded already and shouldn't get a welcome on next booking.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('loyalty_members', function (Blueprint $table) {
            $table->timestamp('welcomed_at')->nullable()->after('joined_at')->index();
        });

        // Backfill: any member whose linked user already verified their
        // email is treated as "already welcomed" — they've onboarded.
        \DB::statement("
            UPDATE loyalty_members
            SET welcomed_at = u.email_verified_at
            FROM users u
            WHERE loyalty_members.user_id = u.id
              AND u.email_verified_at IS NOT NULL
              AND loyalty_members.welcomed_at IS NULL
        ");
    }

    public function down(): void
    {
        Schema::table('loyalty_members', function (Blueprint $table) {
            $table->dropIndex(['welcomed_at']);
            $table->dropColumn('welcomed_at');
        });
    }
};
