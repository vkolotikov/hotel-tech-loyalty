<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referrer_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->foreignId('referee_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('status', 20)->default('pending');
            $table->integer('referrer_points_awarded')->default(0);
            $table->integer('referee_points_awarded')->default(0);
            $table->timestamp('qualified_at')->nullable();
            $table->timestamp('rewarded_at')->nullable();
            $table->timestamps();

            $table->unique(['referrer_id', 'referee_id']);
            $table->index('referrer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('referrals');
    }
};
