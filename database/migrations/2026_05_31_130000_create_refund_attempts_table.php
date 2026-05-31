<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Race-safe "I'm about to refund this mirror" marker.
 *
 * The admin "Issue refund" flow and the Stripe `charge.refunded` webhook
 * BOTH converge on BookingRefundService::applyRefund(). When an admin
 * clicks Refund, Stripe issues the refund + asynchronously fires
 * `charge.refunded` 0.5-2s later. Until 2026-05-31 the only idempotency
 * gate was `booking_mirror.last_refund_id` — which is written LAST in
 * the admin flow (after Smoobu cancel + points reversal + email). The
 * webhook would arrive during that window, see `last_refund_id` still
 * empty, and run the whole refund flow a second time:
 *
 *   - cumulative refunded_amount doubled
 *   - PointsTransaction.reverseTransaction() rejected as duplicate (safe)
 *     BUT Smoobu reservation was cancelled twice (one fails → audit noise)
 *   - Guest got two refund-confirmation emails
 *
 * This table is the PENDING marker: written BEFORE the Stripe call so
 * any concurrent webhook within the 60-second window sees the attempt
 * and no-ops cleanly.
 *
 * Columns:
 *  - mirror_id + payment_intent_id   key to dedup on
 *  - refund_id                       set after stripe.refund() returns
 *  - requested_at / completed_at     start + end of the admin flow
 *  - error                           populated when the attempt failed
 *
 * Unique on (mirror_id, payment_intent_id, requested_at) — the timestamp
 * component lets a legitimate retry (different request) succeed while
 * blocking exact replays. The 60-second freshness check in
 * BookingPublicController is what actually blocks the racing webhook;
 * the unique is belt-and-braces.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('refund_attempts')) {
            return;
        }

        Schema::create('refund_attempts', function (Blueprint $t) {
            $t->id();

            $t->unsignedBigInteger('organization_id');
            $t->foreign('organization_id')
              ->references('id')->on('organizations')
              ->onDelete('cascade');

            $t->unsignedBigInteger('mirror_id');
            $t->foreign('mirror_id')
              ->references('id')->on('booking_mirror')
              ->onDelete('cascade');

            $t->string('payment_intent_id', 255);
            $t->string('refund_id', 255)->nullable();

            $t->timestamp('requested_at');
            $t->timestamp('completed_at')->nullable();
            $t->text('error')->nullable();

            $t->timestamps();

            $t->index(['organization_id', 'mirror_id']);
            $t->index(['mirror_id', 'payment_intent_id', 'requested_at'], 'refund_attempts_dedup_idx');
            $t->unique(
                ['mirror_id', 'payment_intent_id', 'requested_at'],
                'refund_attempts_replay_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refund_attempts');
    }
};
