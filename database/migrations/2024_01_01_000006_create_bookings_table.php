<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('booking_reference', 50)->unique();
            $table->string('hotel_name', 100);
            $table->string('room_type', 100)->nullable();
            $table->date('check_in');
            $table->date('check_out');
            $table->integer('nights')->default(1);
            $table->decimal('total_amount', 10, 2)->default(0);
            $table->string('currency', 3)->default('USD');
            $table->string('status', 30)->default('pending');
            $table->integer('points_earned')->default(0);
            $table->integer('points_redeemed')->default(0);
            $table->string('source', 50)->nullable(); // direct, booking.com, expedia
            $table->text('special_requests')->nullable();
            $table->tinyInteger('rating')->nullable(); // 1-5 post-stay rating
            $table->text('review')->nullable();
            $table->json('webhook_payload')->nullable();
            $table->timestamps();

            $table->index('member_id');
            $table->index('status');
            $table->index('check_in');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
    }
};
