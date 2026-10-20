<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §4.4, §6.1): the website page a post promotes. Its foreign key (null on delete) is
 * added on PostgreSQL; SQLite cannot add one to a table that exists, as with `poster_id`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('content_planner_posts', 'site_page_id')) {
            return;
        }
        Schema::table('content_planner_posts', function (Blueprint $table) {
            $table->unsignedBigInteger('site_page_id')->nullable()->index();
            if (DB::getDriverName() === 'pgsql') {
                $table->foreign('site_page_id')->references('id')->on('content_site_pages')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('content_planner_posts', 'site_page_id')) {
            return;
        }
        Schema::table('content_planner_posts', function (Blueprint $table) {
            if (DB::getDriverName() === 'pgsql') {
                $table->dropForeign(['site_page_id']);
            }
            $table->dropColumn('site_page_id');
        });
    }
};
