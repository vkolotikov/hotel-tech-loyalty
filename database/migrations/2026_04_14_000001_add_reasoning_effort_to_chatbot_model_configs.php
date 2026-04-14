<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chatbot_model_configs', function (Blueprint $table) {
            // reasoning_effort is used by GPT-5.x models (none/low/medium/high/xhigh).
            // For other models this field is ignored during dispatch.
            $table->string('reasoning_effort', 10)->default('low')->after('stop_sequences');
        });
    }

    public function down(): void
    {
        Schema::table('chatbot_model_configs', function (Blueprint $table) {
            $table->dropColumn('reasoning_effort');
        });
    }
};
