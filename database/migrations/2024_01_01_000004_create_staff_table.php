<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('role', 30)->default('receptionist');
            $table->string('hotel_name', 100)->nullable();
            $table->string('department', 100)->nullable();
            $table->boolean('can_award_points')->default(true);
            $table->boolean('can_redeem_points')->default(true);
            $table->boolean('can_manage_offers')->default(false);
            $table->boolean('can_view_analytics')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff');
    }
};
