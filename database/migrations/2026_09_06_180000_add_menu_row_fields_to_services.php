<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Give each menu row its own SERVICE WINDOW and its own "starting price" mark.
 *
 * The three hospitality authors vary these PER ROW — Maison Vela prints
 * "From €48" on the lunch, "Evenings" on the à la carte and "€125 per guest"
 * on the tasting menu — and until now the landing band could only say one
 * line for every row (`services.window`, `services.price_prefix`), because
 * a per-row leaf would need a key the section catalogue cannot enumerate.
 * The row itself is the honest home: it is a `services` row already, edited
 * on the Services screen where its name, price and duration live.
 *
 *  - `service_window` is the free line the authors write where a price
 *    would otherwise go ("Fri–Sun · 12:00", "Evenings"). Named in full
 *    because `window` alone is a reserved word on both Postgres and SQLite.
 *    120 characters: one line of a menu cell, never a paragraph.
 *  - `price_is_from` marks a STARTING price. The word printed before it
 *    ("From", "ab", "à partir de") stays the landing band's own
 *    `price_prefix` leaf, defaulting to the kit author's word — a flag here
 *    and a word there, because the row knows whether its price starts or
 *    fixes and only the tenant knows what that is called in their language.
 *
 * THE BACKFILL IS THE PART THAT KEEPS LIVE PAGES STILL. Before this migration
 * a written band prefix marked EVERY row as a starting price; after it the
 * row's own flag decides and the band leaf is only the word. So every row in
 * the scope of a page whose `content.services.price_prefix` is non-blank is
 * ticked here — the page's organisation, and its brand OR an unassigned row,
 * which is exactly the filter App\Landing\PageContent::scopedToBrand()
 * applies, spelled with the query builder so this file never depends on app
 * code that may change after it has run. Every such row, active or not,
 * because the band prefix marked every row the page could ever list.
 *
 * Nocturne Ritual is the one design that printed NO word before this
 * migration — its treatment list never read `price_prefix` — so its pages
 * are skipped: a mark there would ADD a word the page never showed, and a
 * stray band word on such a page simply becomes the word for the rows the
 * tenant marks later. The one visible change a page can see is by design: a
 * restaurant page that had written both a prefix and a suffix now prints
 * its starting prices without the suffix, the authors' own composition.
 *
 * Safe on the live table: `ADD COLUMN ... NULL` and `ADD COLUMN ... DEFAULT
 * false` are catalogue-only changes on Postgres 11+ (no table rewrite), there
 * is no index to build, and the backfill is one UPDATE per page that wrote a
 * prefix. Guarded with hasTable/hasColumn in both directions, the house shape,
 * so a re-run on an environment that already has the columns is a no-op
 * rather than an error; the backfill is idempotent by construction.
 */
return new class extends Migration
{
    /** The one design whose menu printed no word before this migration. */
    private const PRINTED_NO_WORD = 'nocturne_ritual';

    public function up(): void
    {
        if (!Schema::hasTable('services')) {
            return;
        }

        $missing = array_filter(
            ['service_window', 'price_is_from'],
            fn (string $column) => !Schema::hasColumn('services', $column),
        );

        if ($missing !== []) {
            Schema::table('services', function (Blueprint $table) use ($missing) {
                if (in_array('price_is_from', $missing, true)) {
                    $table->boolean('price_is_from')->default(false)->after('price');
                }
                if (in_array('service_window', $missing, true)) {
                    $table->string('service_window', 120)->nullable()->after('currency');
                }
            });
        }

        $this->markStartingPricesWhereABandPrefixIsWritten();
    }

    public function down(): void
    {
        if (!Schema::hasTable('services')) {
            return;
        }

        $present = array_filter(
            ['service_window', 'price_is_from'],
            fn (string $column) => Schema::hasColumn('services', $column),
        );

        if ($present === []) {
            return;
        }

        Schema::table('services', function (Blueprint $table) use ($present) {
            $table->dropColumn(array_values($present));
        });
    }

    /**
     * Tick `price_is_from` on every row in the scope of a page whose band
     * prefix is written, so the page renders after this migration exactly
     * as it did before it.
     */
    private function markStartingPricesWhereABandPrefixIsWritten(): void
    {
        if (!Schema::hasTable('landing_pages')) {
            return;
        }

        DB::table('landing_pages')
            ->select(['id', 'organization_id', 'brand_id', 'template_key', 'content'])
            ->orderBy('id')
            ->chunk(100, function ($pages) {
                foreach ($pages as $page) {
                    if ($page->template_key === self::PRINTED_NO_WORD || !$this->hasBandPrefix($page->content)) {
                        continue;
                    }

                    DB::table('services')
                        ->where('organization_id', $page->organization_id)
                        ->when($page->brand_id !== null, fn ($rows) => $rows->where(
                            fn ($w) => $w->where('brand_id', $page->brand_id)->orWhereNull('brand_id')
                        ))
                        ->update(['price_is_from' => true]);
                }
            });
    }

    /**
     * Whether `content.services.price_prefix` is a non-blank scalar. The
     * column holds whatever the tenant's saves left there — null, a string,
     * a map — and none of those shapes may stop a deploy.
     */
    private function hasBandPrefix(mixed $content): bool
    {
        $decoded = is_string($content) ? json_decode($content, true) : $content;

        if (!is_array($decoded) || !is_array($decoded['services'] ?? null)) {
            return false;
        }

        $prefix = $decoded['services']['price_prefix'] ?? null;

        return is_scalar($prefix) && trim((string) $prefix) !== '';
    }
};
