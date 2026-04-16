<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('booking_mirror', function (Blueprint $table) {
            $table->string('stripe_payment_intent_id')->nullable()->after('payment_status');
            $table->index('stripe_payment_intent_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('booking_mirror', function (Blueprint $table) {
            $table->dropIndex(['stripe_payment_intent_id']);
            $table->dropColumn('stripe_payment_intent_id');
        });
    }
};
