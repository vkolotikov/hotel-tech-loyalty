<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Release 5a (spec 2026-10-19 §7.1): a post's versions for other platforms share `group_id` (the original's id, no
 * foreign key, as `series_id`), and `poster_id` names who posts it. Its foreign key (users, null on delete) is added
 * on PostgreSQL; SQLite cannot add one to a table that exists, and an id that matches no active staff member counts
 * as nobody either way.
 */
return new class extends Migration
{
    public function up(): void
    {
        $addPoster = !Schema::hasColumn('content_planner_posts', 'poster_id');
        Schema::table('content_planner_posts', function (Blueprint $table) use ($addPoster) {
            if (!Schema::hasColumn('content_planner_posts', 'group_id')) {
                $table->unsignedBigInteger('group_id')->nullable()->index();
            }
            if ($addPoster) {
                $table->unsignedBigInteger('poster_id')->nullable()->index();
                if (DB::getDriverName() === 'pgsql') {
                    $table->foreign('poster_id')->references('id')->on('users')->nullOnDelete();
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('content_planner_posts', function (Blueprint $table) {
            if (Schema::hasColumn('content_planner_posts', 'poster_id')) {
                if (DB::getDriverName() === 'pgsql') {
                    $table->dropForeign(['poster_id']);
                }
                $table->dropColumn('poster_id');
            }
            if (Schema::hasColumn('content_planner_posts', 'group_id')) {
                $table->dropColumn('group_id');
            }
        });
    }
};
