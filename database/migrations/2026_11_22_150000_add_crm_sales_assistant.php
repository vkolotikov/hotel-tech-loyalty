<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('brands', fn (Blueprint $table) => $table->json('crm_sales_profile')->nullable());
        Schema::create('crm_lead_assistant', function (Blueprint $table) {
            $table->foreignId('inquiry_id')->primary()->constrained('inquiries')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('revision')->default(0);
            $table->json('run')->nullable();
            $table->json('results')->nullable();
            $table->json('strategies')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_lead_assistant');
        Schema::table('brands', fn (Blueprint $table) => $table->dropColumn('crm_sales_profile'));
    }
};
