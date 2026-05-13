<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track Stripe refund state on the booking mirror so admins can see the
 * full refund history without bouncing into the Stripe dashboard.
 *
 * - refunded_amount: cumulative refunded (partial refunds add up)
 * - refunded_at: timestamp when payment_status flipped to 'refunded' (full)
 * - last_refund_id: most recent Stripe Refund.id; links back to Stripe's
 *   refund ledger for forensics
 *
 * Refunded amount stored as decimal (matches price_total) so partials
 * reconcile cleanly with the total. NULL = nothing refunded yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_mirror', function (Blueprint $t) {
            $t->decimal('refunded_amount', 10, 2)->nullable()->after('price_paid');
            $t->timestamp('refunded_at')->nullable()->after('refunded_amount');
            $t->string('last_refund_id', 255)->nullable()->after('refunded_at');
        });
    }

    public function down(): void
    {
        Schema::table('booking_mirror', function (Blueprint $t) {
            $t->dropColumn(['refunded_amount', 'refunded_at', 'last_refund_id']);
        });
    }
};
