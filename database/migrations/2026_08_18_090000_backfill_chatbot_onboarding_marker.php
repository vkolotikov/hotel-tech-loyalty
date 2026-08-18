<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Stamp every existing organisation as "chatbot setup already done".
 *
 * The first-run chatbot wizard shows itself when
 * `crm_settings.chatbot_onboarding_completed_at` is absent. Absence is the
 * whole gate, so without this migration the wizard would appear for every
 * venue currently using the product — over a chatbot they have already
 * configured, offering to write starter knowledge entries they do not need.
 *
 * This is why the gate is a marker rather than a heuristic. "No knowledge
 * items" or "config looks default" would misfire on a real venue that
 * deliberately runs a lean setup, and there is no inspection of live config
 * that can reliably distinguish "never set up" from "set up sparsely". A row
 * written at deploy time can: everything that exists now is by definition not
 * a new signup.
 *
 * Follows 2026_06_04_140000_backfill_business_hours_profile exactly —
 * chunkById over organizations, one insertOrIgnore per chunk against the
 * (organization_id, key) unique index. Idempotent, race-proof against an admin
 * completing the wizard mid-migration, and flat in memory at any tenant count.
 *
 * chunkById is safe because organization ids increase monotonically: an org
 * created DURING the backfill either lands in a later chunk (stamped, which is
 * wrong-but-harmless for an org seconds old) or post-dates the final chunk and
 * correctly gets the wizard.
 */
return new class extends Migration
{
    private const MARKER = 'chatbot_onboarding_completed_at';

    public function up(): void
    {
        // `source: backfill` distinguishes these from rows written by a real
        // completion or dismissal, so the difference stays legible later.
        $value = json_encode([
            'completed_at' => now()->toIso8601String(),
            'source'       => 'backfill',
        ], JSON_UNESCAPED_SLASHES);

        $now = now();

        DB::table('organizations')->orderBy('id')->chunkById(500, function ($orgs) use ($value, $now) {
            $rows = $orgs->map(fn ($org) => [
                'organization_id' => $org->id,
                'key'             => self::MARKER,
                'value'           => $value,
                'created_at'      => $now,
                'updated_at'      => $now,
            ])->all();

            if (!empty($rows)) {
                DB::table('crm_settings')->insertOrIgnore($rows);
            }
        });
    }

    public function down(): void
    {
        // Only remove rows this migration wrote. An org that actually completed
        // or dismissed the wizard must keep its marker through a rollback —
        // re-showing a wizard someone has already dealt with is precisely the
        // failure this whole mechanism exists to prevent.
        DB::table('crm_settings')
            ->where('key', self::MARKER)
            ->whereRaw("value::jsonb ->> 'source' = ?", ['backfill'])
            ->delete();
    }
};
