<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The stamp card (HexaTech Loyalty release 7, spec 2026-10-25 §2): a member's cards and the stamps that fill them.
 * Written only by App\Services\Loyalty\Stamps\StampCards.
 *
 * - `stamp_cards`: one row per card a member has had (number 1, 2, …), how many stamps it needs (the venue's number when
 *   it was opened), how many it has, when it was completed and what the full card gave.
 * - `stamps`: one row per visit stamped — at most one per member per venue day, and a booking is stamped once.
 *
 * New tables only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('stamp_cards')) {
            Schema::create('stamp_cards', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $t->unsignedInteger('number');
                $t->unsignedSmallInteger('stamps_needed');
                $t->unsignedSmallInteger('stamps_count')->default(0);
                $t->timestamp('completed_at')->nullable();
                $t->string('reward_kind', 20)->nullable();
                $t->unsignedBigInteger('reward_points_transaction_id')->nullable();
                $t->unsignedBigInteger('reward_redemption_id')->nullable();
                $t->timestamps();
                $t->unique(['member_id', 'number'], 'stamp_cards_member_number_unique');
                $t->index(['organization_id', 'completed_at']);
            });
        }

        if (!Schema::hasTable('stamps')) {
            Schema::create('stamps', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $t->foreignId('stamp_card_id')->constrained('stamp_cards')->cascadeOnDelete();
                $t->string('source', 20);
                $t->string('reference_type', 40)->nullable();
                $t->unsignedBigInteger('reference_id')->nullable();
                $t->date('venue_day');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'member_id', 'venue_day'], 'stamps_member_day_unique');
                $t->unique(['organization_id', 'reference_type', 'reference_id'], 'stamps_reference_unique');
                $t->index('stamp_card_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('stamps');
        Schema::dropIfExists('stamp_cards');
    }
};
