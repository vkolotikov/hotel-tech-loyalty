<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('type', 100); // points_earned, tier_upgrade, offer_available, etc.
            $table->string('title');
            $table->text('body');
            $table->json('data')->nullable(); // extra payload
            $table->string('channel', 20)->default('push');
            $table->unsignedBigInteger('campaign_id')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->boolean('is_sent')->default(false);
            $table->timestamps();

            $table->index('member_id');
            $table->index('is_sent');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_notifications');
    }
};
