<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Posts need a manager's approval (spec 2026-10-16 §6.1): per brand, default off. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            return;
        }
        Schema::table('content_planner_profiles', function (Blueprint $table) {
            $table->boolean('requires_approval')->default(false);
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_planner_profiles', 'requires_approval')) {
            Schema::table('content_planner_profiles', function (Blueprint $table) {
                $table->dropColumn('requires_approval');
            });
        }
    }
};
