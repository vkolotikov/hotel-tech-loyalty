<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Comments on a post (spec 2026-10-16 §7): plain text, kept when their author leaves (`user_id` null). */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_post_comments')) {
            return;
        }
        Schema::create('content_planner_post_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('body');
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();
            $table->index(['post_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_post_comments');
    }
};
