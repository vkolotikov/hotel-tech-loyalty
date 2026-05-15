<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds Deals & Fulfillment tracking to confirmed inquiries.
 *
 * The premise: once a sales inquiry is won, the row moves into a
 * fulfillment workflow. We track it on the same table rather than
 * spinning up a separate `deals` table because a deal IS the won
 * inquiry — the data needed (guest, property, value, notes) is
 * already there, and splitting would force a join on every
 * fulfillment list-render.
 *
 * Stages: payment_pending → design_needed → design_sent →
 *         in_production → ready_to_ship → completed
 *
 * Payment statuses: pending, invoice_sent, partial, paid, refunded
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inquiries', function (Blueprint $table) {
            // The fulfillment workflow stage. Null = not in fulfillment yet
            // (still in sales pipeline). Populated when a Won → Confirmed
            // transition runs the deal-init flow; from there it walks
            // through the 6 stages above to `completed`.
            $table->string('fulfillment_stage', 32)->nullable()->after('next_task_completed');

            // Payment lifecycle, tracked separately from fulfillment because
            // an order can be in_production while still partially paid, etc.
            $table->string('payment_status', 32)->nullable()->after('fulfillment_stage');

            // How much the customer has actually paid against `total_value`.
            // Drives the "Partial · $120.00 paid" caption on the deals table.
            $table->decimal('paid_amount', 12, 2)->nullable()->after('payment_status');

            // Fulfillment window timestamps for the "Est. done"/"Completed"
            // captions and for downstream analytics on fulfillment lead-time.
            $table->timestamp('fulfillment_started_at')->nullable()->after('paid_amount');
            $table->timestamp('fulfillment_completed_at')->nullable()->after('fulfillment_started_at');

            // Composite index: list view filters by stage and sorts by
            // due date. Single combined index covers the common queries.
            $table->index(['fulfillment_stage', 'next_task_due'], 'idx_inq_fulfillment_due');
            $table->index(['payment_status'], 'idx_inq_payment_status');
        });
    }

    public function down(): void
    {
        Schema::table('inquiries', function (Blueprint $table) {
            $table->dropIndex('idx_inq_fulfillment_due');
            $table->dropIndex('idx_inq_payment_status');
            $table->dropColumn([
                'fulfillment_stage',
                'payment_status',
                'paid_amount',
                'fulfillment_started_at',
                'fulfillment_completed_at',
            ]);
        });
    }
};
