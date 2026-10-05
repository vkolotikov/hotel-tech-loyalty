<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every message the appointments sender decided on (Part D): what kind, to
 * whom, in which language, and whether it was sent, skipped (and why) or
 * failed. No subject or body is kept. One reminder per appointment and
 * appointment time, as a database rule (a partial unique index). Additive
 * and reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('client_messages')) {
            return;
        }

        Schema::create('client_messages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_booking_id');
            $table->string('kind', 16);
            $table->string('channel', 16)->default('email');
            $table->string('recipient', 320)->nullable(); // the longest valid address
            $table->string('locale', 5)->default('en');
            $table->string('status', 16);
            $table->string('reason', 32)->nullable();
            $table->timestamp('for_start_at')->nullable();
            $table->timestamp('previous_start_at')->nullable();
            $table->unsignedBigInteger('actor_user_id')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->index('service_booking_id');
            $table->index(['organization_id', 'created_at']);
        });

        DB::statement("CREATE UNIQUE INDEX client_messages_one_reminder ON client_messages (service_booking_id, for_start_at) WHERE kind = 'reminder'");
    }

    public function down(): void
    {
        Schema::dropIfExists('client_messages');
    }
};
