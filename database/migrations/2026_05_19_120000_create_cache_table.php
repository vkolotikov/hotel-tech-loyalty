<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Standard Laravel cache + cache_locks tables.
 *
 * Laravel 11+ defaults to CACHE_STORE=database when the env var is set,
 * which is what Laravel Cloud injects. Without these tables, EVERY
 * scheduled command using ->withoutOverlapping() crashes on first run
 * with "relation cache_locks does not exist". That broke bookings:sync-pms,
 * subscriptions:expire-trials, loyalty:expire-points, etc — none of the
 * crons relying on overlap locks could fire, so the Smoobu calendar
 * silently stopped self-healing.
 *
 * Schema matches the framework's stock 0001_01_01_000001_create_cache_table
 * stub so any future Laravel cache feature that expects these columns
 * keeps working.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('cache')) {
            Schema::create('cache', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->mediumText('value');
                $table->integer('expiration');
            });
        }

        if (!Schema::hasTable('cache_locks')) {
            Schema::create('cache_locks', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->string('owner');
                $table->integer('expiration');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cache_locks');
        Schema::dropIfExists('cache');
    }
};
