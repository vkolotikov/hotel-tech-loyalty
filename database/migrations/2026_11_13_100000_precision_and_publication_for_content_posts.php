<?php

use App\Services\Content\ContentPublication;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('content_planner_posts', function (Blueprint $table) {
            $table->timestamp('created_at', 6)->nullable()->change();
            $table->timestamp('updated_at', 6)->nullable()->change();
            $table->timestamp('published_at', 6)->nullable()->change();
        });
        if (!Schema::hasColumn('content_planner_post_events', 'post_updated_at')) {
            Schema::table('content_planner_post_events', fn (Blueprint $table) => $table->timestamp('post_updated_at', 6)->nullable());
        }
        // Preserve every known publication instant; only repair the historically missing ones.
        DB::table('content_planner_posts')->where('status', 'published')->whereNull('published_at')->orderBy('id')
            ->chunkById(200, function ($posts) {
                foreach ($posts as $post) {
                    DB::table('content_planner_posts')->where('id', $post->id)->whereNull('published_at')
                        ->update(['published_at' => ContentPublication::legacyInstant($post)]);
                }
            });
    }

    public function down(): void
    {
        // Keep precision and repaired historical facts: rolling back must not make old revisions ambiguous again.
    }
};
