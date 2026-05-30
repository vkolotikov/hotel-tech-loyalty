<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * chat_channel_accounts — one row per connected external chat channel
 * (Facebook Page, WhatsApp number, Instagram business account). Brand-
 * scoped (the existing chat widget is brand-scoped, so we match that).
 *
 * page_access_token is Laravel-encrypted at rest via a `saving` hook in
 * the model (same pattern as HotelSetting::ENCRYPTED_KEYS for Stripe +
 * Smoobu credentials).
 *
 * Unique constraints:
 *   - (organization_id, channel, external_id) so a Page can only be
 *     connected once per org. external_id is the Page ID for Messenger,
 *     phone number ID for WhatsApp, IG business account ID for Instagram.
 *   - Partial index on status='active' for fast lookups in the webhook
 *     handler.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('chat_channel_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();

            // 'messenger' for Phase 1. 'whatsapp' / 'instagram' reserved.
            $table->string('channel', 20);

            // Channel-specific IDs.
            $table->string('external_id', 64);          // Page ID for Messenger
            $table->string('display_name', 255)->nullable(); // human-readable Page name for UI
            $table->string('display_avatar_url', 500)->nullable();

            // Connection credentials. page_access_token is the long-lived
            // Page token derived from the user's long-lived token. Stored
            // encrypted by the model. NULL when account is being set up
            // (after OAuth callback but before subscribe-to-webhooks).
            $table->text('page_access_token')->nullable();

            // 'active' | 'reauth_required' | 'disconnected'
            $table->string('status', 24)->default('active');

            // Last time we verified the token works (cron pings /me).
            $table->timestamp('token_verified_at')->nullable();
            // Last webhook arrival timestamp — surfaced in admin status panel.
            $table->timestamp('last_webhook_at')->nullable();
            // Last error from our side talking to Meta. Cleared on next success.
            $table->text('last_error')->nullable();

            // Free-form per-channel config (Phase 2+ may add WhatsApp BSP
            // selection, IG bus account linking metadata, etc).
            $table->jsonb('meta_config')->nullable();

            $table->foreignId('connected_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // Each external ID can only be connected once per org. Note: a
            // single Page can theoretically be connected by two different
            // orgs (multi-tenant), so the unique is per-org, not global.
            $table->unique(['organization_id', 'channel', 'external_id'], 'chat_channel_accounts_org_channel_external_unique');
            $table->index(['organization_id', 'brand_id']);
            $table->index(['channel', 'external_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_channel_accounts');
    }
};
