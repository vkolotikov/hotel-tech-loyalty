<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Release 8's columns (spec 2026-10-25 §3) in sqlite, as migration 2026_10_25_140100 adds them: a membership's end date
 * and its reminder on `loyalty_members`, the visits a member has counted, a tier's visits floor, and what a visit added
 * on release 7's `tier_qualification_counts`. Each added only when its table exists and lacks it.
 *
 * Called as buildValiditySchema() after the shared loyalty schema (and after buildTierCountsSchema(), when used).
 */
trait ValiditySchema
{
    protected function buildValiditySchema(): void
    {
        $columns = [
            'loyalty_members'           => ['membership_valid_until' => 'date', 'membership_reminded_for' => 'date', 'qualifying_visits' => 'visits'],
            'loyalty_tiers'             => ['min_visits' => 'int'],
            'tier_qualification_counts' => ['visits' => 'visits', 'venue_day' => 'date'],
        ];
        foreach ($columns as $table => $wanted) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            Schema::table($table, function (Blueprint $t) use ($table, $wanted) {
                foreach ($wanted as $column => $kind) {
                    if (Schema::hasColumn($table, $column)) {
                        continue;
                    }
                    match ($kind) {
                        'date'   => $t->date($column)->nullable(),
                        'int'    => $t->unsignedInteger($column)->nullable(),
                        'visits' => $t->unsignedInteger($column)->default(0),
                    };
                }
            });
        }
    }
}
