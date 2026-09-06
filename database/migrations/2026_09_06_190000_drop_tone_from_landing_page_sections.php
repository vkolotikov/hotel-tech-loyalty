<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drop `landing_page_sections.tone`.
 *
 * The column was the generic house design's per-band colour
 * (2026_08_31_090000_add_tone_to_landing_page_sections). That design was
 * retired on 2026-09-05 (2026_09_04_090000_retire_ruled_page_landing_template)
 * together with the machinery only it read — SectionType::TONES, the
 * controller's validation, the editor's control and the model's writer — and
 * the column stayed behind as the safe direction on the live table. Nothing
 * has read or written it since: none of the six kit layouts, no endpoint, no
 * screen, and LandingPageSection no longer lists it as fillable. A column
 * nothing can reach is a question every future reader has to answer again,
 * so it goes.
 *
 * `down()` restores the column exactly as the 08-31 migration made it — a
 * nullable 16-character string, no default, no backfill — which is what
 * every row's value was worth: a retired design's colour, empty on every
 * row a kit has ever rendered.
 *
 * Safe on the live table: DROP COLUMN is a catalogue change on Postgres (the
 * data is reclaimed lazily, no rewrite, no long-held lock), and the sqlite
 * test schema has supported it natively since 3.35. Guarded with
 * hasTable/hasColumn in both directions, the house shape, so a re-run on an
 * environment that has already dropped it is a no-op rather than an error.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('landing_page_sections') || !Schema::hasColumn('landing_page_sections', 'tone')) {
            return;
        }

        Schema::table('landing_page_sections', function (Blueprint $table) {
            $table->dropColumn('tone');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('landing_page_sections') || Schema::hasColumn('landing_page_sections', 'tone')) {
            return;
        }

        Schema::table('landing_page_sections', function (Blueprint $table) {
            $table->string('tone', 16)->nullable()->after('enabled');
        });
    }
};
