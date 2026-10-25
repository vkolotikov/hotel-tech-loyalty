<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What each visit added to a member's tier qualification counters (HexaTech Loyalty release 7, spec 2026-10-25 §4.3):
 * a finished stay its nights, one stay and its spend; a completed appointment or a desk purchase its spend. Written only
 * by App\Services\LoyaltyService (through App\Services\Loyalty\Visits\TierCounters), under the member row lock with the
 * counters it changed on `loyalty_members`.
 *
 * One row per reference (unique by organisation, reference type and id): a visit recorded twice — the nightly stay
 * sweep runs again — counts once, and a reversal takes back exactly what its row says was added (`reversed_at`
 * stamped), never what the counters happen to read then.
 *
 * A new table only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tier_qualification_counts')) {
            return;
        }
        Schema::create('tier_qualification_counts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $t->string('reference_type', 40);
            $t->unsignedBigInteger('reference_id');
            $t->unsignedInteger('nights')->default(0);
            $t->unsignedInteger('stays')->default(0);
            $t->decimal('spend', 12, 2)->default(0);
            $t->timestamp('reversed_at')->nullable();
            $t->timestamps();
            $t->unique(['organization_id', 'reference_type', 'reference_id'], 'tier_qualification_counts_reference_unique');
            $t->index('member_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tier_qualification_counts');
    }
};
