<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('voice_agent_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_active')->default(false);
            // Voice selection for TTS
            $table->string('voice', 30)->default('alloy'); // alloy, echo, fable, onyx, nova, shimmer, coral, sage, ash, ballad, verse
            $table->string('tts_model', 60)->default('gpt-4o-mini-tts');
            // Realtime / S2S settings
            $table->boolean('realtime_enabled')->default(false);
            $table->string('realtime_model', 60)->default('gpt-4o-realtime-preview');
            // Personality for voice (overrides text chatbot personality when in voice mode)
            $table->text('voice_instructions')->nullable();
            $table->string('language', 10)->default('en');
            $table->decimal('temperature', 3, 2)->default(0.80);
            $table->timestamps();

            $table->unique('organization_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_agent_configs');
    }
};
