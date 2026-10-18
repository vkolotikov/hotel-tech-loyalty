<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Every approval step on a post (spec 2026-10-16 §6.4): who, what, an optional note, when. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_planner_post_events')) {
            return;
        }
        Schema::create('content_planner_post_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('post_id')->constrained('content_planner_posts')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind', 30);
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['post_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_planner_post_events');
    }
};
