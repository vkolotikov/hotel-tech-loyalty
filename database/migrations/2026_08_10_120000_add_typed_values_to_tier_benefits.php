<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Give tier benefits a machine-readable value so they can actually DO
 * something.
 *
 * `tier_benefits.value` is a free-form `nullable|string|max:255` whose only
 * runtime consumer prints it on the scan screen for a human to read out.
 * So "10% off dining" is a sentence, not a discount: nothing computes it,
 * nothing applies it, and the one mechanically enforceable field that does
 * exist — `loyalty_tiers.earn_rate` — is dead too, because
 * `LoyaltyService::calculateEarnedPoints()` has zero call sites.
 *
 * Two new columns:
 *
 *  - `value_type` — what kind of thing this is:
 *      percent_discount  → value_amount is a percentage (10 = 10% off)
 *      fixed_amount      → value_amount is currency off the bill
 *      points_multiplier → value_amount multiplies points earned (2 = 2x)
 *      free_item         → no amount; the benefit IS the thing
 *      text              → display-only, the existing behaviour
 *  - `value_amount` — the number, when the type has one.
 *
 * `value` is kept and still shown, so nothing that reads it breaks and an
 * admin who has typed prose keeps their prose.
 *
 * Existing rows are migrated on a best-effort basis: a value that reads
 * like "10%" becomes a real 10% discount, "2x" becomes a real multiplier.
 * Anything ambiguous stays `text`, because silently turning a sentence into
 * money is worse than leaving it as a sentence.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('tier_benefits')) {
            return;
        }

        Schema::table('tier_benefits', function (Blueprint $t) {
            if (!Schema::hasColumn('tier_benefits', 'value_type')) {
                $t->string('value_type', 24)->default('text')->after('value');
            }
            if (!Schema::hasColumn('tier_benefits', 'value_amount')) {
                $t->decimal('value_amount', 12, 2)->nullable()->after('value_type');
            }
        });

        $converted = ['percent_discount' => 0, 'points_multiplier' => 0];

        foreach (DB::table('tier_benefits')->whereNotNull('value')->get() as $row) {
            $raw = trim((string) $row->value);
            if ($raw === '') {
                continue;
            }

            // "10%", "10 %", "10% off"
            if (preg_match('/^(\d+(?:\.\d+)?)\s*%/', $raw, $m)) {
                DB::table('tier_benefits')->where('id', $row->id)->update([
                    'value_type'   => 'percent_discount',
                    'value_amount' => (float) $m[1],
                ]);
                $converted['percent_discount']++;
                continue;
            }

            // "2x", "2x points", "1.5 x"
            if (preg_match('/^(\d+(?:\.\d+)?)\s*x\b/i', $raw, $m)) {
                DB::table('tier_benefits')->where('id', $row->id)->update([
                    'value_type'   => 'points_multiplier',
                    'value_amount' => (float) $m[1],
                ]);
                $converted['points_multiplier']++;
                continue;
            }

            // Everything else stays display-only on purpose.
        }

        Log::info('add_typed_values_to_tier_benefits', $converted);
    }

    public function down(): void
    {
        if (!Schema::hasTable('tier_benefits')) {
            return;
        }

        Schema::table('tier_benefits', function (Blueprint $t) {
            foreach (['value_type', 'value_amount'] as $col) {
                if (Schema::hasColumn('tier_benefits', $col)) {
                    $t->dropColumn($col);
                }
            }
        });
    }
};
