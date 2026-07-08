<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Widen free-text Content Planner columns from varchar(100/255) to text.
 *
 * Users (and the AI) write rich, comma-separated descriptions into fields
 * like audience industry / job role / country and channel goal / role /
 * CTA style. The original varchar caps (100/255) rejected those inputs with
 * a 22001 "value too long" error mid-wizard-save. These are all descriptive
 * free-text fields, so text (no limit) is the right type. Dropdown-backed
 * columns (platform, policies, price_position, language) keep their caps.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('content_planner_audiences', function (Blueprint $table) {
            $table->text('industry')->nullable()->change();
            $table->text('country')->nullable()->change();
            $table->text('business_size')->nullable()->change();
            $table->text('job_role')->nullable()->change();
            $table->text('preferred_tone')->nullable()->change();
        });

        Schema::table('content_planner_channels', function (Blueprint $table) {
            $table->text('goal')->nullable()->change();
            $table->text('role')->nullable()->change();
            $table->text('cta_style')->nullable()->change();
            $table->text('visual_style')->nullable()->change();
            $table->text('link_policy')->nullable()->change();
            $table->text('tone_override')->nullable()->change();
        });

        Schema::table('content_planner_profiles', function (Blueprint $table) {
            $table->text('primary_goal')->nullable()->change();
            $table->text('main_cta')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Truncate to the old caps so the varchar change can't fail on
        // over-long rows; descriptive fields lose nothing meaningful.
        Schema::table('content_planner_audiences', function (Blueprint $table) {
            $table->string('industry', 100)->nullable()->change();
            $table->string('country', 100)->nullable()->change();
            $table->string('business_size', 100)->nullable()->change();
            $table->string('job_role', 255)->nullable()->change();
            $table->string('preferred_tone', 100)->nullable()->change();
        });

        Schema::table('content_planner_channels', function (Blueprint $table) {
            $table->string('goal', 255)->nullable()->change();
            $table->string('role', 255)->nullable()->change();
            $table->string('cta_style', 255)->nullable()->change();
            $table->string('visual_style', 255)->nullable()->change();
            $table->string('link_policy', 100)->nullable()->change();
            $table->string('tone_override', 100)->nullable()->change();
        });

        Schema::table('content_planner_profiles', function (Blueprint $table) {
            $table->string('primary_goal', 255)->nullable()->change();
            $table->string('main_cta', 255)->nullable()->change();
        });
    }
};
