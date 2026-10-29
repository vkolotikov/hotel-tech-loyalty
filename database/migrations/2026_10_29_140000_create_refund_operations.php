<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(?string $connection = null): void
    {
        Schema::connection($connection)->create('refund_operations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // No foreign keys: this journal commits independently of the booking transaction.
            $table->unsignedBigInteger('organization_id');
            $table->string('payment_intent_id');
            $table->string('booking_kind', 16);
            $table->unsignedBigInteger('booking_id');
            $table->decimal('amount', 14, 2)->nullable();
            $table->decimal('requested_amount', 14, 2)->nullable();
            $table->decimal('refunded_before', 14, 2)->default(0);
            $table->string('currency', 10);
            $table->string('reason')->nullable();
            $table->string('status', 24)->default('requesting');
            $table->string('refund_id')->nullable();
            $table->string('failure_reason')->nullable();
            $table->timestamp('applied_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'refund_id']);
            $table->index(['organization_id', 'payment_intent_id', 'status'], 'refund_operations_payment_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refund_operations');
    }
};
