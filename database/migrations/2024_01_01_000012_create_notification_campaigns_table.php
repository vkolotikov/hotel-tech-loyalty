<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->json('segment_rules')->nullable(); // {tier_ids, min_points, max_points, last_stay_days}
            $table->string('title');
            $table->text('body');
            $table->json('data')->nullable();
            $table->string('channel', 20)->default('push');
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->integer('target_count')->default(0);
            $table->integer('sent_count')->default(0);
            $table->integer('opened_count')->default(0);
            $table->string('status', 20)->default('draft');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Add deferred FK from push_notifications to notification_campaigns
        Schema::table('push_notifications', function (Blueprint $table) {
            $table->foreign('campaign_id')->references('id')->on('notification_campaigns')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_campaigns');
    }
};
