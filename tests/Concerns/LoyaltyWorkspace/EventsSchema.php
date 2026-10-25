<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Events, their tiers, sign-ups and check-ins (release 8, spec 2026-10-25 §4) in sqlite, as migration
 * 2026_10_25_150000 builds them, with their unique indexes (one sign-up and one check-in per member per event). No
 * foreign keys, as the tests' other hand-built tables. Guarded: a table another suite built first is left as it is.
 *
 * Called as buildEventsSchema() after the shared loyalty schema.
 */
trait EventsSchema
{
    protected function buildEventsSchema(): void
    {
        if (!Schema::hasTable('loyalty_events')) {
            Schema::create('loyalty_events', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('title', 120);
                $t->text('description')->nullable();
                $t->dateTime('starts_at');
                $t->dateTime('ends_at');
                $t->unsignedBigInteger('access_place_id')->nullable();
                $t->string('location', 200)->nullable();
                $t->unsignedInteger('points')->default(0);
                $t->boolean('counts_as_visit')->default(true);
                $t->string('admits', 10)->default('all');
                $t->boolean('sign_up')->default(false);
                $t->boolean('walk_ins')->default(true);
                $t->unsignedInteger('capacity')->nullable();
                $t->string('status', 12)->default('draft');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('loyalty_event_tiers')) {
            Schema::create('loyalty_event_tiers', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('loyalty_event_id');
                $t->unsignedBigInteger('tier_id');
                $t->unique(['loyalty_event_id', 'tier_id'], 'loyalty_event_tiers_pair_unique');
            });
        }
        if (!Schema::hasTable('loyalty_event_registrations')) {
            Schema::create('loyalty_event_registrations', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('loyalty_event_id');
                $t->unsignedBigInteger('member_id');
                $t->string('status', 12)->default('signed_up');
                $t->string('source', 10)->default('portal');
                $t->timestamp('signed_up_at')->nullable();
                $t->timestamp('cancelled_at')->nullable();
                $t->timestamps();
                $t->unique(['loyalty_event_id', 'member_id'], 'loyalty_event_registrations_member_unique');
            });
        }
        if (!Schema::hasTable('loyalty_event_attendances')) {
            Schema::create('loyalty_event_attendances', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('loyalty_event_id');
                $t->unsignedBigInteger('member_id');
                $t->timestamp('checked_in_at');
                $t->unsignedBigInteger('checked_in_by')->nullable();
                $t->boolean('walk_in')->default(false);
                $t->unsignedBigInteger('scan_event_id')->nullable();
                $t->unsignedBigInteger('points_transaction_id')->nullable();
                $t->timestamps();
                $t->unique(['loyalty_event_id', 'member_id'], 'loyalty_event_attendances_member_unique');
            });
        }
    }

    /**
     * An event of the bound organisation, written as EventEditor writes one (times as stored digits), published and
     * open to every member unless told otherwise; `$tierIds` are its tiers (with `admits` `tiers`).
     *
     * @param array<string, mixed> $attributes
     * @param list<int>            $tierIds
     */
    protected function makeEvent(array $attributes = [], array $tierIds = []): \App\Models\LoyaltyEvent
    {
        $event = new \App\Models\LoyaltyEvent();
        $event->forceFill($attributes + [
            'organization_id' => (int) app('current_organization_id'),
            'title'           => 'Wine tasting',
            'starts_at'       => '2026-10-05 18:00:00',
            'ends_at'         => '2026-10-05 21:00:00',
            'points'          => 50,
            'counts_as_visit' => true,
            'admits'          => $tierIds === [] ? 'all' : 'tiers',
            'sign_up'         => false,
            'walk_ins'        => true,
            'status'          => 'published',
        ]);
        $event->save();
        foreach ($tierIds as $tierId) {
            \Illuminate\Support\Facades\DB::table('loyalty_event_tiers')->insert(['loyalty_event_id' => $event->id, 'tier_id' => $tierId]);
        }

        return $event;
    }
}
