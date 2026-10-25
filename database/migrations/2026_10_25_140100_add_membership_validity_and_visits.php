<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Loyalty release 8 (spec 2026-10-25 §3):
 *
 * - `loyalty_members.membership_valid_until` — an optional end date (a yearly or monthly membership); after it the
 *   member is refused at every place. Written only by App\Services\Loyalty\Members\MembershipValidity.
 *   `membership_reminded_for` — the end date the "your membership ends soon" reminder was sent for (once per date).
 * - Tier progress by visits: `loyalty_tiers.min_visits`, `loyalty_members.qualifying_visits`, and on release 7's
 *   `tier_qualification_counts` the visits a reference added and its venue day (one visit per member per day).
 *
 * Nullable or defaulted columns only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_members', function (Blueprint $t) {
            if (!Schema::hasColumn('loyalty_members', 'membership_valid_until')) {
                $t->date('membership_valid_until')->nullable();
            }
            if (!Schema::hasColumn('loyalty_members', 'membership_reminded_for')) {
                $t->date('membership_reminded_for')->nullable();
            }
            if (!Schema::hasColumn('loyalty_members', 'qualifying_visits')) {
                $t->unsignedInteger('qualifying_visits')->default(0);
            }
        });
        Schema::table('loyalty_tiers', function (Blueprint $t) {
            if (!Schema::hasColumn('loyalty_tiers', 'min_visits')) {
                $t->unsignedInteger('min_visits')->nullable();
            }
        });
        Schema::table('tier_qualification_counts', function (Blueprint $t) {
            if (!Schema::hasColumn('tier_qualification_counts', 'visits')) {
                $t->unsignedInteger('visits')->default(0);
            }
            if (!Schema::hasColumn('tier_qualification_counts', 'venue_day')) {
                $t->date('venue_day')->nullable();
                $t->index(['member_id', 'venue_day'], 'tier_qualification_counts_member_day_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tier_qualification_counts', function (Blueprint $t) {
            if (Schema::hasColumn('tier_qualification_counts', 'venue_day')) {
                $t->dropIndex('tier_qualification_counts_member_day_index');
                $t->dropColumn('venue_day');
            }
            if (Schema::hasColumn('tier_qualification_counts', 'visits')) {
                $t->dropColumn('visits');
            }
        });
        Schema::table('loyalty_tiers', function (Blueprint $t) {
            if (Schema::hasColumn('loyalty_tiers', 'min_visits')) {
                $t->dropColumn('min_visits');
            }
        });
        Schema::table('loyalty_members', function (Blueprint $t) {
            foreach (['qualifying_visits', 'membership_reminded_for', 'membership_valid_until'] as $column) {
                if (Schema::hasColumn('loyalty_members', $column)) {
                    $t->dropColumn($column);
                }
            }
        });
    }
};
