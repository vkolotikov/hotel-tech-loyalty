<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a lost dispute took back, kept apart from refunds (HexaTech Loyalty release 6, item 1): `refunded_amount` holds
 * every amount gone back to the guest — refunds and lost disputes both — while Stripe's `amount_refunded`, which the
 * `charge.refunded` webhook compares with it, counts refunds only. `dispute_lost_amount` is the part of
 * `refunded_amount` that lost disputes took, so the compare subtracts it (BookingRefundService::recordStripeRefund(),
 * BookingPublicController::recordServiceBookingRefund()). NULL reads as nothing lost.
 *
 * Nullable columns without a default: on PostgreSQL a catalogue change only (no table rewrite), safe with
 * `migrate --force` on a live database; guarded, so it runs on a database that already carries them.
 */
return new class extends Migration
{
    private const TABLES = ['booking_mirror', 'service_bookings'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, 'dispute_lost_amount')) {
                Schema::table($table, fn (Blueprint $t) => $t->decimal('dispute_lost_amount', 10, 2)->nullable());
            }
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'dispute_lost_amount')) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn('dispute_lost_amount'));
            }
        }
    }
};
