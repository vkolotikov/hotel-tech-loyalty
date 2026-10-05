<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Money at the desk (Part E): one row per payment taken or refund given for
 * a service booking — cash, card at the desk, transfer, other, or a refund
 * through Stripe of the online card payment. Rows are never edited or
 * deleted; a correction is a refund. Additive and reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('service_booking_payments')) {
            return;
        }

        Schema::create('service_booking_payments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_booking_id');
            $table->string('kind', 8);
            $table->string('method', 16);
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3);
            $table->string('note', 200)->nullable();
            // A desk refund that undoes a wrong entry: the client still owes the money (unlike a goodwill refund).
            $table->boolean('corrects')->default(false);
            $table->string('stripe_refund_id', 64)->nullable();
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->timestamps();
            $table->index('service_booking_id');
            $table->index(['organization_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_booking_payments');
    }
};
