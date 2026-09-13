<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per Amazon account, stored only as a SHA-256. Re-pairing
        // updates the row, so uniqueness never needs a partial index.
        Schema::create('voice_alexa_links', function (Blueprint $table): void {
            $table->id();
            $table->string('alexa_user_hash', 64)->unique();
            $table->unsignedBigInteger('user_id')->index();
            $table->unsignedBigInteger('organization_id')->index();
            $table->boolean('can_write')->default(false);
            $table->timestamp('linked_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_alexa_links');
    }
};
