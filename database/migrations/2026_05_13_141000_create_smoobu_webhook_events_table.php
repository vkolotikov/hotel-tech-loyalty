<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dedup table for Smoobu webhook deliveries. Smoobu doesn't include a
 * stable per-delivery event ID, so we key on a hash of the request body.
 * Identical body = same logical event = replay (or buggy Smoobu retry).
 *
 * On insert collision the webhook controller returns 200 + a no-op so
 * Smoobu doesn't keep retrying.
 *
 * Old rows are pruned weekly via a scheduled `webhook_event_id` retention
 * policy — see SmoobuWebhookEvent::pruneOlderThan().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('smoobu_webhook_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->nullable()->constrained()->nullOnDelete();
            // SHA-256 of the canonicalised body. 64 hex chars.
            $t->char('body_hash', 64);
            $t->string('action', 60)->nullable();
            $t->string('reservation_id', 60)->nullable();
            $t->timestamp('received_at')->useCurrent();
            $t->unique('body_hash', 'smoobu_webhook_events_body_hash_unique');
            $t->index(['organization_id', 'received_at']);
            $t->index('reservation_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('smoobu_webhook_events');
    }
};
