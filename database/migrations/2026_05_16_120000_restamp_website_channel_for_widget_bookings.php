<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Re-stamp BookingMirror rows that originated from the booking widget
 * but got their channel_name clobbered by a subsequent Smoobu sync.
 *
 * Detection rule: any row with a non-null stripe_payment_intent_id is
 * by definition a widget booking — only the widget creates Stripe
 * PaymentIntents on this codebase. Older rows where syncReservation()
 * overwrote channel_name to 'Direct booking' or similar get pulled
 * back to 'Website' so they reappear in the admin Website tab.
 *
 * The application-side fix in BookingEngineService::syncReservation()
 * prevents this from happening again going forward.
 */
return new class extends Migration {
    public function up(): void
    {
        DB::table('booking_mirror')
            ->whereNotNull('stripe_payment_intent_id')
            ->where(function ($q) {
                $q->whereNull('channel_name')
                  ->orWhere('channel_name', '!=', 'Website');
            })
            ->update(['channel_name' => 'Website']);
    }

    public function down(): void
    {
        // Non-destructive heal — nothing to roll back.
    }
};
