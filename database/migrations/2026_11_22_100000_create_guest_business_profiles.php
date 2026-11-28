<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guest_business_profiles', function (Blueprint $table) {
            $table->foreignId('guest_id')->primary()->constrained('guests')->cascadeOnDelete();
            $table->unsignedInteger('revision')->default(0);
            $table->json('fields')->nullable();
            $table->json('sources')->nullable();
            $table->json('discovery')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_business_profiles');
    }
};
