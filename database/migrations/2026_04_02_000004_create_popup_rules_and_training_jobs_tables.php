<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('popup_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('widget_config_id')->nullable()->constrained('chat_widget_configs')->nullOnDelete();
            $table->string('name', 120);
            $table->boolean('is_active')->default(true);
            $table->string('trigger_type', 30); // page_load, time_delay, scroll_depth, exit_intent
            $table->string('trigger_value', 60)->nullable(); // e.g. "5" seconds, "50" percent
            $table->string('url_match_type', 20)->default('contains'); // exact, contains, starts_with, regex
            $table->string('url_match_value', 500)->nullable();
            $table->string('visitor_type', 20)->default('all'); // all, new, returning
            $table->jsonb('language_targets')->nullable();
            $table->text('message');
            $table->jsonb('quick_replies')->nullable();
            $table->unsignedInteger('priority')->default(0);
            $table->unsignedInteger('impressions_count')->default(0);
            $table->unsignedInteger('clicks_count')->default(0);
            $table->timestamps();

            $table->index('organization_id');
        });

        Schema::create('training_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 30)->default('openai');
            $table->string('model_name', 60)->nullable();
            $table->string('training_file_id', 120)->nullable();
            $table->string('job_id', 120)->nullable();
            $table->string('status', 30)->default('preparing'); // preparing, uploading, training, completed, failed, cancelled
            $table->string('base_model', 60)->default('gpt-4o-mini');
            $table->string('fine_tuned_model', 120)->nullable();
            $table->string('training_data_path', 500)->nullable();
            $table->jsonb('hyperparameters')->nullable();
            $table->jsonb('result_metrics')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index('organization_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('training_jobs');
        Schema::dropIfExists('popup_rules');
    }
};
