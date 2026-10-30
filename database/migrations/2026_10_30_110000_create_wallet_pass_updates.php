<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('wallet_passes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            // Installed credentials belong to the original member, never to a merge survivor.
            $t->foreignId('member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $t->string('provider', 10);
            $t->string('type_id', 191);
            $t->string('serial', 191);
            $t->text('authentication_token')->nullable();
            $t->string('content_hash', 64)->nullable();
            $t->unsignedBigInteger('revision')->default(0);
            $t->string('synced_hash', 64)->nullable();
            $t->string('failure_code', 40)->nullable();
            $t->unsignedInteger('attempts')->default(0);
            $t->timestamp('next_attempt_at')->nullable()->index();
            $t->timestamp('last_success_at')->nullable();
            $t->timestamps();
            $t->unique(['organization_id', 'member_id', 'provider'], 'wallet_member_provider_unique');
            $t->unique(['provider', 'type_id', 'serial'], 'wallet_identity_unique');
        });
        Schema::create('wallet_registrations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('wallet_pass_id')->constrained()->cascadeOnDelete();
            $t->string('device_hash', 64)->index();
            $t->text('push_token');
            $t->timestamps();
            $t->unique(['wallet_pass_id', 'device_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_registrations');
        Schema::dropIfExists('wallet_passes');
    }
};
