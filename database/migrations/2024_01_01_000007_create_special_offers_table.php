<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('special_offers', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description');
            $table->string('type', 30);
            $table->decimal('value', 8, 2)->default(0); // % discount OR multiplier OR nights OR points
            $table->json('tier_ids')->nullable(); // null = all tiers, else [1,2,3]
            $table->date('start_date');
            $table->date('end_date');
            $table->integer('usage_limit')->nullable(); // null = unlimited
            $table->integer('times_used')->default(0);
            $table->integer('per_member_limit')->nullable(); // max claims per member
            $table->string('image_url')->nullable();
            $table->string('terms_conditions')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->boolean('ai_generated')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('is_active');
            $table->index('start_date');
            $table->index('end_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('special_offers');
    }
};
