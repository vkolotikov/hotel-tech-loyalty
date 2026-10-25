<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What each visit added to a member's tier counters (release 7, spec 2026-10-25 §4.3) in sqlite, as migration
 * 2026_10_25_130000 builds it, with its unique index (a reference counted once). No foreign keys, as the tests' other
 * hand-built tables. Guarded: a table another suite built first is left as it is.
 *
 * Called as buildTierCountsSchema() (Laravel calls setUp<TraitName>() itself, before the base tables exist).
 */
trait TierCountsSchema
{
    protected function buildTierCountsSchema(): void
    {
        if (!Schema::hasTable('tier_qualification_counts')) {
            Schema::create('tier_qualification_counts', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('member_id');
                $t->string('reference_type', 40);
                $t->unsignedBigInteger('reference_id');
                $t->unsignedInteger('nights')->default(0);
                $t->unsignedInteger('stays')->default(0);
                $t->decimal('spend', 12, 2)->default(0);
                $t->timestamp('reversed_at')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'reference_type', 'reference_id'], 'tier_qualification_counts_reference_unique');
            });
        }
    }

    /**
     * The expiry buckets as release 7 leaves them: `expires_at` may be empty (points that never expire). Called BEFORE
     * the shared loyalty schema, whose own copy of the table keeps the older NOT NULL and is then passed over.
     */
    protected function buildNeverExpiringBucketsSchema(): void
    {
        if (!Schema::hasTable('point_expiry_buckets')) {
            Schema::create('point_expiry_buckets', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('transaction_id')->nullable();
                $t->integer('original_points');
                $t->integer('remaining_points');
                $t->date('earned_at');
                $t->date('expires_at')->nullable();
                $t->boolean('is_expired')->default(false);
                $t->timestamps();
                $t->index(['member_id', 'is_expired', 'expires_at']);
            });
        }
    }
}
