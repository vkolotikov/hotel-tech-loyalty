<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('loyalty_visit_effects', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->string('reference_type', 40);
            $table->unsignedBigInteger('reference_id');
            $table->string('operation', 12)->default('record');
            $table->json('payload');
            $table->boolean('pending')->default(true);
            $table->unsignedInteger('attempts')->default(0);
            $table->json('failed_effects')->nullable();
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'reference_type', 'reference_id'], 'loyalty_visit_effects_reference_unique');
            $table->index(['pending', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_visit_effects');
    }
};
