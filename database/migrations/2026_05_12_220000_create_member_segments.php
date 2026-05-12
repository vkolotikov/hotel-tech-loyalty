<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reusable member segments — admin defines a set of criteria once
 * (tier filter, activity recency, points range, etc.) and gets a
 * dynamic list of matching members back. Used as the target list for
 * bulk campaign messages so admins don't have to manually select
 * recipients each time.
 *
 * `definition` is a small jsonb document interpreted by
 * MemberSegmentService. Format documented there.
 *
 * `member_count_cached` + `member_count_computed_at` give the list
 * page a fast read without re-running the full evaluation on every
 * mount. A refresh button on the page bumps it on demand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_segments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->string('name', 120);
            $t->text('description')->nullable();
            $t->jsonb('definition');
            $t->unsignedInteger('member_count_cached')->nullable();
            $t->timestamp('member_count_computed_at')->nullable();
            $t->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('last_sent_at')->nullable();
            $t->unsignedInteger('total_sent_count')->default(0);
            $t->timestamps();

            $t->index(['organization_id', 'name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_segments');
    }
};
