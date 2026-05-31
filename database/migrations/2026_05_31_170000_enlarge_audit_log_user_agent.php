<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Live overflow evidence: audit_logs.user_agent (varchar(255) default)
 * rejects writes from common bot user-agents and any browser that
 * appends long Sec-CH-UA / brand tokens. Same risk on
 * review_submissions.user_agent (varchar(512)).
 *
 * Switch both to TEXT — no length cap on disk, 1GB toast-cell ceiling
 * in practice. Mirrors the 2026-05-31 enlargement of visitors.user_agent
 * and friends.
 *
 * Neither column is indexed (verified). In-place ALTER from varchar to
 * text on Postgres is metadata-only, no rewrite.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('audit_logs') && Schema::hasColumn('audit_logs', 'user_agent')) {
            DB::statement('ALTER TABLE audit_logs ALTER COLUMN user_agent TYPE TEXT');
        }

        if (Schema::hasTable('review_submissions') && Schema::hasColumn('review_submissions', 'user_agent')) {
            DB::statement('ALTER TABLE review_submissions ALTER COLUMN user_agent TYPE TEXT');
        }
    }

    public function down(): void
    {
        // Intentionally one-way. TEXT → varchar(N) would silently truncate
        // any rows wider than N and risk data loss. Leave as TEXT on rollback.
    }
};
