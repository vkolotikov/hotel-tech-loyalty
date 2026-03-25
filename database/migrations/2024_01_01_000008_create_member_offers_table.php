<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->foreignId('offer_id')->constrained('special_offers')->cascadeOnDelete();
            $table->boolean('ai_generated')->default(false);
            $table->text('ai_reason')->nullable();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('used_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->string('status', 20)->default('available');
            $table->timestamps();

            $table->unique(['member_id', 'offer_id']);
            $table->index('member_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_offers');
    }
};
