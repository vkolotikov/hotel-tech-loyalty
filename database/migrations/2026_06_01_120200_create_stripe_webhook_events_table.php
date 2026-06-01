<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Event-id dedup table for Stripe webhooks. Mirrors the existing
 * smoobu_webhook_events table — same INSERT-then-23505-skip pattern.
 *
 * Stripe explicitly recommends event-id dedup at
 * https://docs.stripe.com/webhooks — they may send the same Event object
 * twice during a network blip. Per-action idempotency (last_refund_id,
 * mirror status guards) is good defense-in-depth but doesn't close all
 * windows. The 60s refund-attempt freshness gate is also not enough for
 * worst-case retries beyond that window.
 *
 * Unique on (organization_id, event_id) so the same event delivered to
 * different orgs (impossible in practice but legal) doesn't collide.
 */
return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('stripe_webhook_events')) {
            return;
        }

        Schema::create('stripe_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('event_id', 80); // evt_xxx — Stripe ids are ~28 chars but reserve room
            $table->string('event_type', 80);
            $table->string('payment_intent_id', 80)->nullable();
            $table->string('charge_id', 80)->nullable();
            $table->timestamp('received_at')->useCurrent();
            $table->timestamps();

            $table->unique(['organization_id', 'event_id'], 'stripe_webhook_events_dedup_unique');
            $table->index(['organization_id', 'event_type', 'received_at'], 'stripe_webhook_events_org_type_recv_idx');
            $table->index('payment_intent_id', 'stripe_webhook_events_pi_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stripe_webhook_events');
    }
};
