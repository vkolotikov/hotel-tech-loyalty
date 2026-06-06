<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Industry Platform Plan Phase 5 — backfill business_hours_profile.
 *
 * `PlannerController::resolveWorkWindow()` reads
 * `crm_settings.business_hours_profile` as the per-org default work
 * window when the API caller doesn't pass `work_start`/`work_end`. Tier
 * 3 of the resolver still falls back to the hardcoded 09:00/18:00, but
 * that path should never fire in practice — every existing org gets
 * an explicit row written here so behaviour is preserved AND any
 * future code that depends on the row being present can rely on it.
 *
 * Idempotent: skip rows already present (admin may have written their
 * own profile via Settings → Planner before this migration ran).
 *
 * Per-industry defaults are NOT applied here. This migration captures
 * the canonical English 09:00/18:00 default everywhere; the per-
 * industry defaults (beauty 09:00-19:00 Tue-Sat, medical 08:00-17:00
 * Mon-Fri with 12:00-13:00 lunch, restaurant 11:00-23:00 daily) land
 * via OrganizationSetupService::setupDefaults() for NEW orgs only,
 * keyed on the new org's `industry`. Existing orgs keep 09:00/18:00
 * until an admin explicitly switches via the Settings → Planner UI
 * (Phase 5.x scope).
 */
return new class extends Migration
{
    public function up(): void
    {
        // crm_settings has a composite unique on (organization_id, key)
        // since the 2026-05-11 per-org migration. Walk every org row,
        // upsert the default. Bound query for safety on huge tenant
        // pools; chunkById to keep memory flat under any size.
        //
        // chunkById is safe because organization IDs are monotonically
        // increasing — orgs created DURING the backfill either fall
        // into a later chunk or post-date the final chunk and pick up
        // their profile via OrganizationSetupService::setupDefaults()
        // at create time.
        $defaultProfile = json_encode([
            'start' => '09:00',
            'end'   => '18:00',
        ], JSON_UNESCAPED_SLASHES);

        // Single timestamp for the whole backfill — acts as a "this
        // came from the migration" marker. Don't move inside the loop.
        $now = now();

        DB::table('organizations')->orderBy('id')->chunkById(500, function ($orgs) use ($defaultProfile, $now) {
            // Phase 5 reviewer fix: replace exists+insert pair with
            // one insertOrIgnore per chunk. Postgres compiles this to
            // INSERT ... ON CONFLICT (organization_id, key) DO NOTHING
            // — atomic, race-proof against concurrent admin writes,
            // and ~25x fewer round-trips than the previous two-query-
            // per-org loop. The composite unique on (organization_id,
            // key) added by 2026_05_11_120000 is what makes the
            // conflict path well-defined.
            $rows = $orgs->map(fn ($org) => [
                'organization_id' => $org->id,
                'key'             => 'business_hours_profile',
                'value'           => $defaultProfile,
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
        // Defensive: only delete rows whose value canonically matches
        // the default we wrote. Admins who customised AFTER this
        // migration ran (e.g. switched to a beauty profile) should
        // KEEP their setting through a down() — same idempotency
        // intent as `up()`.
        //
        // Compare via Postgres jsonb canonicalisation rather than raw
        // TEXT byte-equality. A future writer could persist the same
        // semantic value with different key order or whitespace; raw
        // string compare would silently miss those rows. jsonb compare
        // sorts keys + strips whitespace before equality, so the
        // canonical-value match is robust to writer quirks.
        DB::table('crm_settings')
            ->where('key', 'business_hours_profile')
            ->whereRaw("value::jsonb = ?::jsonb", ['{"start":"09:00","end":"18:00"}'])
            ->delete();
    }
};
