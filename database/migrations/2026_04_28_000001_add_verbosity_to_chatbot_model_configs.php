<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chatbot_model_configs', function (Blueprint $table) {
            // text.verbosity is used by gpt-5.x via the Responses API
            // (low/medium/high). For other models this field is ignored
            // during dispatch — we keep the column nullable-with-default
            // so existing rows remain valid without a backfill.
            $table->string('verbosity', 10)->default('medium')->after('reasoning_effort');
        });
    }

    public function down(): void
    {
        Schema::table('chatbot_model_configs', function (Blueprint $table) {
            $table->dropColumn('verbosity');
        });
    }
};
