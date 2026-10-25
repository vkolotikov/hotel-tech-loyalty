<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Places and who may enter them (release 8, spec 2026-10-25 §1) in sqlite, as migration 2026_10_25_140000 builds them,
 * with the pair's unique index; and the place and event columns on `scan_events` when that table exists. No foreign
 * keys, as the tests' other hand-built tables. Guarded: a table another suite built first is left as it is.
 *
 * Called as buildAccessSchema() after the shared loyalty schema.
 */
trait AccessSchema
{
    protected function buildAccessSchema(): void
    {
        if (!Schema::hasTable('access_places')) {
            Schema::create('access_places', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name', 80);
                $t->string('description', 300)->nullable();
                $t->string('admits', 10)->default('all');
                $t->unsignedInteger('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('access_place_tiers')) {
            Schema::create('access_place_tiers', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('access_place_id');
                $t->unsignedBigInteger('tier_id');
                $t->unique(['access_place_id', 'tier_id'], 'access_place_tiers_pair_unique');
            });
        }
        if (Schema::hasTable('scan_events')) {
            Schema::table('scan_events', function (Blueprint $t) {
                if (!Schema::hasColumn('scan_events', 'access_place_id')) {
                    $t->unsignedBigInteger('access_place_id')->nullable();
                }
                if (!Schema::hasColumn('scan_events', 'loyalty_event_id')) {
                    $t->unsignedBigInteger('loyalty_event_id')->nullable();
                }
            });
        }
    }
}
