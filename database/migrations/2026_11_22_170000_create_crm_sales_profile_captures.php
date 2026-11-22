<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('crm_sales_profile_captures', function (Blueprint $table) {
            $table->foreignId('brand_id')->primary()->constrained()->cascadeOnDelete();
            $table->uuid('run_id');
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 16);
            $table->timestamp('queued_at');
            $table->longText('input')->nullable();
            $table->json('outcome')->nullable();
            $table->timestamps();
            $table->index(['status', 'queued_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_sales_profile_captures');
    }
};
