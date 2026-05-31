<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Token health columns for chat_channel_accounts.
 *
 * Facebook Login for Business (FBLB) tokens carry an explicit scope
 * grant + lifetime that varies per-Page. Storing scopes + expiry
 * timestamps lets the connect flow and the health-check cron tell
 * 'expired' from 'revoked' from 'scope_missing' — three distinct
 * customer-facing reauth states the old single 'reauth_required'
 * lumped together.
 *
 *   token_scopes             — list returned by /debug_token (granted scopes)
 *   token_expires_at         — token expiry (null = effectively non-expiring)
 *   data_access_expires_at   — Meta's data-access window (separate from token)
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('chat_channel_accounts', function (Blueprint $table) {
            $table->jsonb('token_scopes')->nullable()->after('last_error');
            $table->timestamp('token_expires_at')->nullable()->after('token_scopes');
            $table->timestamp('data_access_expires_at')->nullable()->after('token_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('chat_channel_accounts', function (Blueprint $table) {
            $table->dropColumn(['token_scopes', 'token_expires_at', 'data_access_expires_at']);
        });
    }
};
