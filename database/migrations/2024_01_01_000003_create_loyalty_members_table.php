<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('member_number', 20)->unique(); // e.g. HL-2024-000001
            $table->foreignId('tier_id')->constrained('loyalty_tiers');
            $table->bigInteger('lifetime_points')->default(0);
            $table->bigInteger('current_points')->default(0);
            $table->date('points_expiry_date')->nullable();
            $table->string('qr_code_token', 64)->unique();
            $table->string('nfc_uid', 50)->nullable()->unique();
            $table->timestamp('nfc_card_issued_at')->nullable();
            $table->string('referral_code', 20)->unique();
            $table->foreignId('referred_by')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->boolean('marketing_consent')->default(false);
            $table->boolean('email_notifications')->default(true);
            $table->boolean('push_notifications')->default(true);
            $table->string('expo_push_token')->nullable();
            $table->timestamp('joined_at')->useCurrent();
            $table->timestamp('last_activity_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
            $table->index('tier_id');
            $table->index('member_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_members');
    }
};
