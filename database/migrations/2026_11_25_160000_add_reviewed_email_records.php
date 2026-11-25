<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm_lead_assistant', function (Blueprint $table) {
            $table->json('approved_quote')->nullable();
            $table->json('email_reviews')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('crm_lead_assistant', fn (Blueprint $table) => $table->dropColumn(['approved_quote', 'email_reviews']));
    }
};
