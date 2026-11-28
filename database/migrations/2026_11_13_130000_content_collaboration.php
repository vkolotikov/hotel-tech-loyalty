<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'wants_content_collaboration_email')) {
            Schema::table('users', fn (Blueprint $t) => $t->boolean('wants_content_collaboration_email')->default(false));
        }
        Schema::table('content_planner_post_comments', function (Blueprint $t) {
            $t->timestamp('created_at', 6)->nullable()->change();
            $t->timestamp('updated_at', 6)->nullable()->change();
            $t->timestamp('edited_at', 6)->nullable()->change();
        });
        Schema::table('content_planner_post_events', fn (Blueprint $t) => $t->timestamp('created_at', 6)->nullable()->change());
        Schema::table('content_planner_reads', fn (Blueprint $t) => $t->timestamp('seen_at', 6)->nullable()->change());
        if (!Schema::hasColumn('content_planner_post_comments', 'media_context')) {
            Schema::table('content_planner_post_comments', function (Blueprint $t) {
                // Immutable safe metadata, retained after detach/archive; never a client-supplied URL.
                $t->unsignedBigInteger('media_id')->nullable();
                $t->json('media_context')->nullable();
                $t->json('mentions')->nullable();
            });
        }
        if (!Schema::hasTable('content_notifications')) {
            Schema::create('content_notifications', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id');
                $t->unsignedBigInteger('post_id');
                $t->unsignedBigInteger('recipient_id');
                $t->string('source_type', 16);
                $t->unsignedBigInteger('source_id');
                $t->string('kind', 32);
                $t->timestamp('created_at', 6);
                // Claimed before transport: an ambiguous send is never retried and duplicated.
                $t->timestamp('email_attempted_at', 6)->nullable();
                $t->unique(['recipient_id', 'source_type', 'source_id'], 'content_notification_recipient_event');
                $t->index(['organization_id', 'brand_id', 'recipient_id', 'created_at'], 'content_notification_inbox');
            });
        }
    }

    public function down(): void
    {
        // Keep consent, history and timestamp precision when code is rolled back.
    }
};
