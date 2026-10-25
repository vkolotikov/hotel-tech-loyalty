<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The stamp card's tables (release 7, spec 2026-10-25 §2) in sqlite, as migration 2026_10_25_100000 builds them, with
 * its two unique indexes (one stamp per member per venue day; a booking stamped once). No foreign keys, as the tests'
 * other hand-built tables. Guarded: a table another suite built first is left as it is.
 *
 * Called as buildVisitsSchema() (Laravel calls setUp<TraitName>() itself, before the base tables exist).
 * saveOptionsOn() switches options on as of an earlier day, so the visits a test stamps after it count.
 */
trait VisitsSchema
{
    protected function buildVisitsSchema(): void
    {
        if (!Schema::hasTable('stamp_cards')) {
            Schema::create('stamp_cards', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('member_id');
                $t->unsignedInteger('number');
                $t->unsignedSmallInteger('stamps_needed');
                $t->unsignedSmallInteger('stamps_count')->default(0);
                $t->timestamp('completed_at')->nullable();
                $t->string('reward_kind', 20)->nullable();
                $t->unsignedBigInteger('reward_points_transaction_id')->nullable();
                $t->unsignedBigInteger('reward_redemption_id')->nullable();
                $t->timestamps();
                $t->unique(['member_id', 'number'], 'stamp_cards_member_number_unique');
            });
        }
        if (!Schema::hasTable('stamps')) {
            Schema::create('stamps', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('stamp_card_id');
                $t->string('source', 20);
                $t->string('reference_type', 40)->nullable();
                $t->unsignedBigInteger('reference_id')->nullable();
                $t->date('venue_day');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'member_id', 'venue_day'], 'stamps_member_day_unique');
                $t->unique(['organization_id', 'reference_type', 'reference_id'], 'stamps_reference_unique');
            });
        }
    }

    /**
     * Saves the venue's options as if on an earlier day (the clock moved there and back): ProgrammeOptions keeps the day
     * the stamp card and cashback were switched on, and visits before it never count, so a test that stamps visits of
     * past days switches them on before those days.
     *
     * @param array<string, mixed> $changes
     */
    protected function saveOptionsOn(string $day, int $orgId, array $changes, ?User $by): void
    {
        $now = CarbonImmutable::now();
        $this->travelTo(CarbonImmutable::parse("{$day} 12:00:00"));
        try {
            ProgrammeOptions::save($orgId, $changes, $by);
        } finally {
            $this->travelTo($now);
        }
    }
}
