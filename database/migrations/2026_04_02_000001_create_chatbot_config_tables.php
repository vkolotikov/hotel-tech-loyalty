<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chatbot_behavior_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('assistant_name', 120)->default('Hotel Assistant');
            $table->string('assistant_avatar', 500)->nullable();
            $table->text('identity')->nullable();
            $table->text('goal')->nullable();
            $table->string('sales_style', 20)->default('consultative');
            $table->string('tone', 20)->default('professional');
            $table->string('reply_length', 20)->default('moderate');
            $table->string('language', 10)->default('en');
            $table->jsonb('core_rules')->nullable();
            $table->text('escalation_policy')->nullable();
            $table->text('fallback_message')->nullable();
            $table->text('custom_instructions')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('organization_id');
        });

        Schema::create('chatbot_model_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 20)->default('openai');
            $table->string('model_name', 60)->default('gpt-4o');
            $table->decimal('temperature', 3, 2)->default(0.70);
            $table->decimal('top_p', 3, 2)->default(1.00);
            $table->unsignedInteger('max_tokens')->default(500);
            $table->decimal('frequency_penalty', 3, 2)->default(0.00);
            $table->decimal('presence_penalty', 3, 2)->default(0.00);
            $table->jsonb('stop_sequences')->nullable();
            $table->timestamps();

            $table->unique('organization_id');
        });

        Schema::create('knowledge_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->text('description')->nullable();
            $table->unsignedInteger('priority')->default(0);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('organization_id');
        });

        Schema::create('knowledge_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('knowledge_categories')->nullOnDelete();
            $table->string('question', 500);
            $table->text('answer');
            $table->jsonb('keywords')->nullable();
            $table->unsignedInteger('priority')->default(0);
            $table->unsignedInteger('use_count')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('organization_id');
            $table->index('category_id');
        });

        Schema::create('knowledge_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('file_name', 255);
            $table->string('file_path', 500);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedInteger('size_bytes')->nullable();
            $table->longText('extracted_text')->nullable();
            $table->unsignedInteger('chunks_count')->default(0);
            $table->string('processing_status', 20)->default('pending');
            $table->timestamps();

            $table->index('organization_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('knowledge_documents');
        Schema::dropIfExists('knowledge_items');
        Schema::dropIfExists('knowledge_categories');
        Schema::dropIfExists('chatbot_model_configs');
        Schema::dropIfExists('chatbot_behavior_configs');
    }
};
