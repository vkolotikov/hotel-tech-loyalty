<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_correspondence_syncs', function (Blueprint $table) {
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->foreignId('guest_id')->constrained()->cascadeOnDelete();
            $table->primary(['brand_id', 'guest_id']);
            $table->timestampTz('due_at')->index();
            $table->uuid('claim')->nullable();
            $table->json('email')->nullable();
            $table->json('whatsapp')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_correspondence_syncs');
    }
};
