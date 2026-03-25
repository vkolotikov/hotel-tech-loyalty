<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loyalty_tiers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50)->unique(); // Bronze, Silver, Gold, Platinum, Diamond
            $table->integer('min_points')->default(0);
            $table->integer('max_points')->nullable(); // null = unlimited (top tier)
            $table->decimal('earn_rate', 4, 2)->default(1.00); // points per $1
            $table->integer('bonus_nights')->default(0); // complimentary nights per year
            $table->string('color_hex', 7)->default('#CD7F32');
            $table->string('icon', 50)->default('star');
            $table->json('perks')->nullable(); // JSON array of perk descriptions
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_tiers');
    }
};
