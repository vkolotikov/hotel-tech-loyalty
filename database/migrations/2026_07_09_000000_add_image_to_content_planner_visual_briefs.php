<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Store an AI-generated image per post visual brief.
 * The image is produced by OpenAI (gpt-image-1 / dall-e-3) from the brief's
 * image prompt, then persisted to the media disk; image_url holds the
 * public URL (local /storage path or cloud CDN URL, via MediaService).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('content_planner_visual_briefs', function (Blueprint $table) {
            $table->text('image_url')->nullable();
            $table->string('image_status', 20)->nullable(); // ready|failed (null = none yet)
            $table->string('image_model', 50)->nullable();
            $table->text('image_error')->nullable();
            $table->timestamp('image_generated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('content_planner_visual_briefs', function (Blueprint $table) {
            $table->dropColumn(['image_url', 'image_status', 'image_model', 'image_error', 'image_generated_at']);
        });
    }
};
