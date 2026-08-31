<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Let a tenant choose each band's colour.
 *
 * The template has always carried a two-surface system — `.band--paper-2`
 * and `.band--ink` on top of the plain band — but which section got which
 * was HARDCODED in the partials, so "I want the About band on the page's own
 * background" had no answer short of a code change.
 *
 * NULLABLE WITH NO DEFAULT AND NO BACKFILL, and that is the whole design:
 * null means "whatever this section was authored to look like", which is
 * exactly what every existing row already renders as. So this migration
 * changes the appearance of precisely nothing — no live page moves, and the
 * renderer's byte goldens are untouched — while giving the tone control
 * somewhere to write. See App\Landing\SectionType::bandClass(), which is the
 * one place that fallback is expressed.
 *
 * Safe on the live table for the same reason: `ADD COLUMN ... NULL` with no
 * default is a catalogue-only change on Postgres (no table rewrite, no
 * long-held ACCESS EXCLUSIVE lock while rows are touched), and there is no
 * index to build. Guarded with hasTable/hasColumn in both directions, the
 * house shape (2026_08_11_090000_add_description_to_loyalty_tiers), so a
 * re-run on an environment that already has the column is a no-op rather
 * than an error.
 *
 * 16 characters because the allowlist it stores is
 * App\Landing\SectionType::TONES' keys — short tenant-facing ids, the
 * longest of which is six characters today. The column is not the
 * allowlist: the controller validates against SectionType and the renderer
 * re-whitelists at read time, the same defence-in-depth pairing
 * `theme.palette` already gets.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('landing_page_sections') || Schema::hasColumn('landing_page_sections', 'tone')) {
            return;
        }

        Schema::table('landing_page_sections', function (Blueprint $table) {
            $table->string('tone', 16)->nullable()->after('enabled');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('landing_page_sections') || !Schema::hasColumn('landing_page_sections', 'tone')) {
            return;
        }

        Schema::table('landing_page_sections', function (Blueprint $table) {
            $table->dropColumn('tone');
        });
    }
};
