<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->string('event_type', 100); // page_view, offer_viewed, qr_scanned, etc.
            $table->json('properties')->nullable();
            $table->string('session_id', 64)->nullable();
            $table->string('platform', 20)->nullable(); // ios, android, web
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('member_id');
            $table->index('event_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_events');
    }
};
