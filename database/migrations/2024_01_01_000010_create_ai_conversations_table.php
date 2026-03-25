<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('session_id', 64)->unique();
            $table->json('messages'); // [{role, content, timestamp}]
            $table->integer('tokens_used')->default(0);
            $table->string('model', 50)->default('gpt-4o');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('member_id');
            $table->index('session_id');
        });

        Schema::create('ai_recommendations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('type', 50); // offer, tier_nudge, upsell, churn_prevention
            $table->text('recommendation');
            $table->json('context')->nullable();
            $table->decimal('confidence_score', 3, 2)->nullable(); // 0.00-1.00
            $table->boolean('acted_on')->default(false);
            $table->timestamp('acted_on_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index('member_id');
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_recommendations');
        Schema::dropIfExists('ai_conversations');
    }
};
