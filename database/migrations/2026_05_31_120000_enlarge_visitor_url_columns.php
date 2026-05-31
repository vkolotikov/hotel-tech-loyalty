<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Live Nightwatch evidence (2026-05-31): visitors.referrer overflowed
 * varchar(500) on an Instagram redirect URL (utm_* + fbclid params).
 * Same overflow risk exists on the other text-of-arbitrary-length columns.
 * Switch to TEXT so PostgreSQL stops rejecting writes — TEXT has no
 * length cap on disk and the only practical limit is the 1GB toast cell.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('visitors')) {
            return;
        }

        $cols = ['user_agent', 'referrer', 'current_page', 'current_page_title'];

        foreach ($cols as $col) {
            // Postgres allows in-place ALTER from varchar to text without rewrite.
            DB::statement("ALTER TABLE visitors ALTER COLUMN {$col} TYPE TEXT");
        }

        if (Schema::hasTable('visitor_page_views')) {
            DB::statement("ALTER TABLE visitor_page_views ALTER COLUMN title TYPE TEXT");
        }
    }

    public function down(): void
    {
        // Intentionally one-way. TEXT → varchar(N) would silently truncate
        // any rows wider than N and risk data loss. Leave as TEXT on rollback.
    }
};
