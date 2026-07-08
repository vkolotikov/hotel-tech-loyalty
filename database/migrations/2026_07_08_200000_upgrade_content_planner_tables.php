<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Upgrades the Content Planner from a basic shell to a strategic system:
 * brand DNA + positioning on profiles, richer audience psychology,
 * per-platform strategy on channels, and strategic metadata on posts
 * (weekday role, funnel stage, post type, engagement mechanics).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('content_planner_profiles', function (Blueprint $table) {
            $table->text('brand_summary')->nullable();
            $table->text('usp')->nullable();
            $table->text('mission')->nullable();
            $table->json('brand_values')->nullable();
            $table->text('brand_promise')->nullable();
            $table->text('differentiators')->nullable();
            $table->json('proof_points')->nullable();
            $table->string('price_position', 50)->nullable(); // budget|mid_market|premium|luxury
            $table->string('main_cta')->nullable();
            $table->json('important_links')->nullable();
            $table->json('positioning')->nullable();      // {old_way,new_way,beliefs[],transformation}
            $table->json('key_messages')->nullable();
            $table->json('content_mix')->nullable();       // {category: percent}
            $table->json('weekly_rhythm')->nullable();     // {monday:{role,notes},...}
            $table->json('engagement_goals')->nullable();
            $table->json('visual_style')->nullable();      // {style,image_types[],avoid[],aspect_ratios[],colors[]}
            $table->string('trend_mode', 50)->default('evergreen');
            $table->integer('knowledge_score')->nullable();
            $table->integer('setup_step')->default(0);
        });

        Schema::table('content_planner_audiences', function (Blueprint $table) {
            $table->string('job_role')->nullable();
            $table->string('business_size', 100)->nullable();
            $table->json('fears')->nullable();
            $table->json('emotional_triggers')->nullable();
            $table->json('rational_triggers')->nullable();
            $table->json('questions')->nullable();
            $table->text('content_they_trust')->nullable();
            $table->text('desired_transformation')->nullable();
            $table->boolean('is_ai_assumed')->default(false);
        });

        Schema::table('content_planner_channels', function (Blueprint $table) {
            $table->string('role')->nullable(); // strategic role of the platform
            $table->integer('posts_per_week')->nullable();
            $table->string('cta_style')->nullable();
            $table->string('visual_style')->nullable();
            $table->string('link_policy', 100)->nullable();
        });

        Schema::table('content_planner_brand_voices', function (Blueprint $table) {
            $table->string('sentence_style', 50)->nullable();  // short|balanced|storytelling
            $table->string('point_of_view', 50)->nullable();   // brand|founder|expert|customer
            $table->json('claims_to_avoid')->nullable();
        });

        Schema::table('content_planner_posts', function (Blueprint $table) {
            $table->string('weekday_role', 50)->nullable();
            $table->string('funnel_stage', 50)->nullable();   // awareness|consideration|conversion|retention
            $table->string('post_type', 50)->nullable();
            $table->text('strategic_reason')->nullable();
            $table->json('engagement_mechanic')->nullable();  // {type,instruction}
            $table->string('generated_by', 50)->nullable();   // manual|single|calendar
        });
    }

    public function down(): void
    {
        Schema::table('content_planner_posts', function (Blueprint $table) {
            $table->dropColumn(['weekday_role', 'funnel_stage', 'post_type', 'strategic_reason', 'engagement_mechanic', 'generated_by']);
        });
        Schema::table('content_planner_brand_voices', function (Blueprint $table) {
            $table->dropColumn(['sentence_style', 'point_of_view', 'claims_to_avoid']);
        });
        Schema::table('content_planner_channels', function (Blueprint $table) {
            $table->dropColumn(['role', 'posts_per_week', 'cta_style', 'visual_style', 'link_policy']);
        });
        Schema::table('content_planner_audiences', function (Blueprint $table) {
            $table->dropColumn(['job_role', 'business_size', 'fears', 'emotional_triggers', 'rational_triggers', 'questions', 'content_they_trust', 'desired_transformation', 'is_ai_assumed']);
        });
        Schema::table('content_planner_profiles', function (Blueprint $table) {
            $table->dropColumn([
                'brand_summary', 'usp', 'mission', 'brand_values', 'brand_promise', 'differentiators',
                'proof_points', 'price_position', 'main_cta', 'important_links', 'positioning', 'key_messages',
                'content_mix', 'weekly_rhythm', 'engagement_goals', 'visual_style', 'trend_mode',
                'knowledge_score', 'setup_step',
            ]);
        });
    }
};
