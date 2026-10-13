<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A manager's choice of calendar colour for a team member (Appointments, spec §5.3). Null = automatic. */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('service_masters', 'color')) {
            Schema::table('service_masters', function (Blueprint $table) {
                $table->string('color', 7)->nullable()->after('avatar');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('service_masters', 'color')) {
            Schema::table('service_masters', function (Blueprint $table) {
                $table->dropColumn('color');
            });
        }
    }
};
