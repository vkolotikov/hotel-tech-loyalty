<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 1. Content Planner Profiles
        Schema::create('content_planner_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->string('default_language', 10)->default('en');
            $table->string('default_tone', 100)->nullable();
            $table->string('primary_goal')->nullable();
            $table->json('secondary_goals')->nullable();
            $table->json('content_rules')->nullable();
            $table->json('knowledge_sources')->nullable();
            $table->longText('knowledge_summary_long')->nullable();
            $table->text('knowledge_summary_short')->nullable();
            $table->timestamp('last_knowledge_sync_at')->nullable();
            $table->timestamp('setup_completed_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'brand_id']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 2. Content Planner Audiences
        Schema::create('content_planner_audiences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('industry', 100)->nullable();
            $table->string('country', 100)->nullable();
            $table->string('language', 10)->nullable();
            $table->json('pain_points')->nullable();
            $table->json('goals')->nullable();
            $table->json('objections')->nullable();
            $table->json('buying_triggers')->nullable();
            $table->json('preferred_platforms')->nullable();
            $table->string('preferred_tone', 100)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 3. Content Planner Channels
        Schema::create('content_planner_channels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('platform', 50); // linkedin, instagram, tiktok, facebook, x, youtube, blog, email
            $table->string('label');
            $table->string('url')->nullable();
            $table->string('goal')->nullable();
            $table->foreignId('audience_id')->nullable()->constrained('content_planner_audiences')->nullOnDelete();
            $table->string('default_language', 10)->nullable();
            $table->string('tone_override', 100)->nullable();
            $table->json('frequency')->nullable(); // { mon: true, tue: true, ... }
            $table->json('preferred_formats')->nullable(); // [post, carousel, reel, thread]
            $table->string('emoji_policy', 50)->nullable();
            $table->string('hashtag_policy', 50)->nullable();
            $table->integer('max_length')->nullable();
            $table->boolean('active')->default(true);
            $table->json('settings')->nullable();
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 4. Content Planner Brand Voices
        Schema::create('content_planner_brand_voices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('name');
            $table->string('tone', 100)->nullable();
            $table->string('style', 100)->nullable();
            $table->string('formality_level', 50)->nullable();
            $table->string('emoji_policy', 50)->nullable();
            $table->string('hashtag_policy', 50)->nullable();
            $table->json('preferred_words')->nullable();
            $table->json('forbidden_words')->nullable();
            $table->json('example_good_posts')->nullable();
            $table->json('example_bad_posts')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 5. Content Planner Strategies
        Schema::create('content_planner_strategies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('title');
            $table->text('summary')->nullable();
            $table->json('goals')->nullable();
            $table->json('platform_strategy')->nullable();
            $table->json('content_mix')->nullable();
            $table->text('visual_direction')->nullable();
            $table->json('ai_output')->nullable(); // Full AI response for debugging
            $table->string('status', 50)->default('active'); // active, archived, superseded
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['status']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 6. Content Planner Pillars
        Schema::create('content_planner_pillars', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->foreignId('strategy_id')->nullable()->constrained('content_planner_strategies')->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('purpose')->nullable();
            $table->integer('frequency_weight')->default(5); // 1-10
            $table->json('recommended_platforms')->nullable();
            $table->json('example_topics')->nullable();
            $table->json('cta_examples')->nullable();
            $table->text('visual_direction')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['strategy_id']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 7. Content Planner Campaigns
        Schema::create('content_planner_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('name');
            $table->text('goal')->nullable();
            $table->foreignId('audience_id')->nullable()->constrained('content_planner_audiences')->nullOnDelete();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->json('platforms')->nullable();
            $table->string('offer')->nullable();
            $table->string('landing_page')->nullable();
            $table->text('key_message')->nullable();
            $table->string('cta')->nullable();
            $table->string('status', 50)->default('draft'); // draft, active, paused, completed, archived
            $table->text('notes')->nullable();
            $table->json('ai_output')->nullable();
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['status']);
            $table->index(['start_date', 'end_date']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 8. Content Planner Posts
        Schema::create('content_planner_posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->foreignId('campaign_id')->nullable()->constrained('content_planner_campaigns')->nullOnDelete();
            $table->foreignId('strategy_id')->nullable()->constrained('content_planner_strategies')->nullOnDelete();
            $table->foreignId('pillar_id')->nullable()->constrained('content_planner_pillars')->nullOnDelete();
            $table->foreignId('audience_id')->nullable()->constrained('content_planner_audiences')->nullOnDelete();
            $table->string('platform', 50);
            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_time')->nullable();
            $table->string('language', 10)->default('en');
            $table->string('topic')->nullable();
            $table->string('title')->nullable();
            $table->string('goal')->nullable();
            $table->string('format', 50)->nullable(); // text_post, carousel, reel, thread, etc.
            $table->string('status', 50)->default('idea'); // idea, draft, needs_review, needs_visual, approved, ready_to_publish, published, skipped, archived
            $table->longText('main_copy')->nullable();
            $table->text('short_copy')->nullable();
            $table->text('alternative_copy')->nullable();
            $table->string('hook', 500)->nullable();
            $table->string('cta')->nullable();
            $table->json('hashtags')->nullable();
            $table->foreignId('visual_brief_id')->nullable();
            $table->json('quality_score')->nullable(); // { brand_fit: 9, platform_fit: 8, ... }
            $table->json('source_context')->nullable(); // Where this came from
            $table->string('published_url')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['campaign_id']);
            $table->index(['strategy_id']);
            $table->index(['pillar_id']);
            $table->index(['status']);
            $table->index(['scheduled_date']);
            $table->index(['platform']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 9. Content Planner Visual Briefs
        Schema::create('content_planner_visual_briefs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->string('visual_type', 50)->nullable(); // image, video, carousel, infographic
            $table->string('aspect_ratio', 20)->nullable(); // 1:1, 16:9, 9:16
            $table->string('style')->nullable();
            $table->text('description')->nullable();
            $table->text('scene')->nullable();
            $table->string('mood', 100)->nullable();
            $table->text('composition')->nullable();
            $table->string('text_overlay')->nullable();
            $table->text('avoid')->nullable();
            $table->text('video_script')->nullable();
            $table->text('image_prompt_future')->nullable(); // For future image generation
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique('post_id');
        });

        // 10. Content Planner Post Variations
        Schema::create('content_planner_post_variations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->string('variation_type', 50); // alternative, shorter, longer, professional, friendly
            $table->longText('copy');
            $table->text('notes')->nullable();
            $table->json('ai_output')->nullable();
            $table->timestamps();

            $table->index(['post_id']);
        });

        // 11. Content Planner Assets
        Schema::create('content_planner_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('title');
            $table->string('file_path');
            $table->string('file_type', 50);
            $table->text('description')->nullable();
            $table->json('tags')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['organization_id', 'brand_id']);
        });

        // 12. Content Planner AI Generations (logging)
        Schema::create('content_planner_ai_generations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('generation_type', 50); // knowledge_summary, strategy, calendar, post_copy, visual_brief, quality_check, etc.
            $table->string('model', 50)->nullable();
            $table->string('prompt_hash', 64)->nullable();
            $table->longText('prompt_text')->nullable();
            $table->longText('response_json')->nullable();
            $table->integer('tokens_input')->nullable();
            $table->integer('tokens_output')->nullable();
            $table->decimal('cost_estimate', 10, 4)->nullable();
            $table->string('status', 50)->nullable(); // success, error, partial
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['planner_profile_id']);
            $table->index(['user_id']);
            $table->index(['generation_type']);
            $table->index(['created_at']);
            $table->index(['organization_id', 'brand_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_ai_generations');
        Schema::dropIfExists('content_planner_assets');
        Schema::dropIfExists('content_planner_post_variations');
        Schema::dropIfExists('content_planner_visual_briefs');
        Schema::dropIfExists('content_planner_posts');
        Schema::dropIfExists('content_planner_campaigns');
        Schema::dropIfExists('content_planner_pillars');
        Schema::dropIfExists('content_planner_strategies');
        Schema::dropIfExists('content_planner_brand_voices');
        Schema::dropIfExists('content_planner_channels');
        Schema::dropIfExists('content_planner_audiences');
        Schema::dropIfExists('content_planner_profiles');
    }
};
