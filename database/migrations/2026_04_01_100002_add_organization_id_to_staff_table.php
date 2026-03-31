<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The staff table was accidentally omitted from the multitenancy migration.
 * Add organization_id and backfill from the user's organization.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('staff', 'organization_id')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->unsignedBigInteger('organization_id')->nullable()->after('id');
                $table->index('organization_id');
            });

            // Backfill from users table
            DB::statement('
                UPDATE staff
                SET organization_id = users.organization_id
                FROM users
                WHERE staff.user_id = users.id
                  AND staff.organization_id IS NULL
                  AND users.organization_id IS NOT NULL
            ');
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('staff', 'organization_id')) {
            Schema::table('staff', function (Blueprint $table) {
                $table->dropIndex(['organization_id']);
                $table->dropColumn('organization_id');
            });
        }
    }
};
