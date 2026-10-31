<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The phones staff signed in to with the HexaTech Staff app, for request alerts (owner 2026-10-31). One row per
 * phone: an Expo push token belongs to one person at a time, so a desk phone handed over moves to whoever signed in
 * last. `staff.expo_push_token` stays the Hotel Staff app's own single token.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('staff_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('app', 32);
            $table->string('token', 255)->unique();
            $table->string('platform', 16)->nullable();
            $table->string('language', 8)->default('en');
            $table->boolean('alerts')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'app', 'alerts']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_devices');
    }
};
