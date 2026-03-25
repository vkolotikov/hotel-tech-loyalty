<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('points_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $table->string('type', 30);
            $table->integer('points'); // positive = earn, negative = redeem/expire
            $table->bigInteger('balance_after');
            $table->string('description');
            $table->string('reference_type')->nullable(); // booking, offer, manual
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->foreignId('staff_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('amount_spent', 10, 2)->nullable(); // for earn transactions
            $table->decimal('earn_rate', 4, 2)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index('member_id');
            $table->index('type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('points_transactions');
    }
};
