<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot the resolved extras catalog onto each booking_mirror row at confirm
 * time so admin queries, refund math, orphan-recovery email render, and the
 * Smoobu priceElements payload are all self-contained — no need to re-walk a
 * moving catalog (BookingExtra rows can be renamed / repriced / soft-deleted).
 *
 * Shape:
 *   [
 *     { "id": "12", "name": "Champagne welcome", "price_type": "per_stay",
 *       "unit_price": 40.00, "quantity": 2, "line_total": 80.00 },
 *     ...
 *   ]
 *
 * Singular table name — the booking_mirror plural footgun is documented in
 * CLAUDE.md and has cost us two failed deploys already. Use `booking_mirror`.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('booking_mirror')) {
            return;
        }

        if (!Schema::hasColumn('booking_mirror', 'extras_json')) {
            Schema::table('booking_mirror', function (Blueprint $table) {
                $table->jsonb('extras_json')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('booking_mirror') && Schema::hasColumn('booking_mirror', 'extras_json')) {
            Schema::table('booking_mirror', function (Blueprint $table) {
                $table->dropColumn('extras_json');
            });
        }
    }
};
