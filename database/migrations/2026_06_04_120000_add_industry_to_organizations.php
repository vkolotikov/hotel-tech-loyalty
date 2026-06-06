<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Industry Platform Plan — Phase 1 foundation.
 *
 * Adds the canonical `organizations.industry` column. Source of truth for
 * the industry-aware platform work (sidebar gating, dashboard KPIs, AI
 * prompts, vocabulary swap, email templates, wallet pass payloads,
 * mobile app theme).
 *
 * NULLABLE on purpose — every existing tenant ships with NULL until the
 * Phase 10 backfill writes `'hotel'` everywhere. Every reader uses the
 * fallback chain: column → `crm_settings.industry_preset` → `'hotel'`.
 * See `Organization::getResolvedIndustryAttribute()`.
 *
 * The legacy `crm_settings.industry_preset` + `planner_preset` +
 * `members_preset` rows keep being written for back-compat — the new
 * column is authoritative when set, falls back to the legacy keys when
 * not. That's the contract documented in apps/loyalty/CLAUDE.md.
 *
 * Indexed because every authenticated request resolves the industry to
 * gate features, choose KPIs, pick AI prompts. The `(industry)` index
 * also makes super-admin filters (count orgs per industry, find all
 * medical orgs for a one-off operation) cheap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $t) {
            if (!Schema::hasColumn('organizations', 'industry')) {
                $t->string('industry', 32)->nullable()->after('country');
                $t->index('industry');
            }
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $t) {
            if (Schema::hasColumn('organizations', 'industry')) {
                // Wrap dropIndex: if up() ran when the column already
                // existed without an index (some replay/rollback edge),
                // dropIndex would throw on a non-existent index name.
                try { $t->dropIndex(['industry']); } catch (\Throwable) {}
                $t->dropColumn('industry');
            }
        });
    }
};
