<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A repeated post and its copies share the original's id here (spec 2026-10-15 §8). */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('content_planner_posts', 'series_id')) {
            Schema::table('content_planner_posts', function (Blueprint $table) {
                $table->unsignedBigInteger('series_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('content_planner_posts', 'series_id')) {
            Schema::table('content_planner_posts', function (Blueprint $table) {
                $table->dropIndex(['series_id']);
                $table->dropColumn('series_id');
            });
        }
    }
};
