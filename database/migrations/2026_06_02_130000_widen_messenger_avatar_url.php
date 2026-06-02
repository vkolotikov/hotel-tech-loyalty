<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Facebook CDN URLs for Page profile pictures routinely exceed 500
 * characters — they're signed URLs with embedded auth tokens that
 * shape like:
 *   https://scontent.fbsv1-1.fna.fbcdn.net/v/t39.30808-1/...?_nc_cat=…&_nc_ohc=…&_nc_oc=…&_nc_zt=…&_nc_ht=…&_nc_gid=…&oh=…&oe=…
 *
 * The original varchar(500) cap on `chat_channel_accounts.display_avatar_url`
 * (migration 2026_05_30_120000) rejected every FBLB connect attempt
 * with "The avatar url field must not be greater than 500 characters"
 * (422 from MessengerIntegrationController::connect's validation rule).
 *
 * Switch to TEXT — same pattern we shipped on visitors.referrer for the
 * Instagram redirect URL overflow (migration 2026_05_31_120000). TEXT
 * is metadata-only on Postgres, runs essentially instantly.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('chat_channel_accounts')) {
            return;
        }
        if (!Schema::hasColumn('chat_channel_accounts', 'display_avatar_url')) {
            return;
        }

        DB::statement('ALTER TABLE chat_channel_accounts ALTER COLUMN display_avatar_url TYPE TEXT');
    }

    public function down(): void
    {
        // Intentionally one-way. TEXT → varchar(500) would silently
        // truncate any rows wider than 500 chars and break the very
        // accounts this migration unstuck.
    }
};
