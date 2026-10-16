<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A channel's usual posting time, HH:MM on the venue's clock (spec 2026-10-15 §5); empty = the first suggested time. */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('content_planner_channels', 'post_time')) {
            Schema::table('content_planner_channels', function (Blueprint $table) {
                $table->string('post_time', 5)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_planner_channels', 'post_time')) {
            Schema::table('content_planner_channels', function (Blueprint $table) {
                $table->dropColumn('post_time');
            });
        }
    }
};
