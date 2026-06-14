<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use App\Models\BookingIdempotencyKey;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the `bookings:prune-holds` daily cron (June 1 2026 ship).
 *
 * Two reasons for this command to exist:
 *
 *   1. GDPR PII retention. BookingHold.payload_json carries guest
 *      name / email / phone. Holds that aren't confirmed accumulate
 *      INDEFINITELY pre-fix — at ~2KB each across hundreds of orgs,
 *      Postgres bloats fast AND we hold PII past any reasonable
 *      retention window.
 *
 *   2. BookingIdempotencyKey grows on every distinct idempotency
 *      key seen (each confirm() call). Production already shows
 *      these climbing into the millions after months of traffic.
 *
 * Contract:
 *
 *   - `expires_at < now - {days}` is the prune predicate. Active +
 *     recently-expired rows STAY (the confirm() retry window
 *     depends on them).
 *
 *   - --dry-run shows the count without deleting (lets ops preview
 *     a sweep).
 *
 *   - --days + --idemp-days are independent so the two tables can
 *     have different retention windows.
 *
 *   - --limit caps per-table per-run rows deleted (back-pressure
 *     against accidental huge deletes; chunks within the limit).
 *
 *   - Idempotent: re-running on a clean store produces zero new
 *     deletions.
 *
 *   - withoutGlobalScopes() — the cron has no tenant context, must
 *     cross-tenant prune.
 */
class PruneBookingHoldsTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingConfirmSchema(); // booking_holds + booking_idempotency_keys
    }

    /** Seed a hold with a specific expires_at offset (+N days from now, negative = past). */
    private function seedHold(int $orgId, string $token, int $daysOffsetFromNow): void
    {
        DB::table('booking_holds')->insert([
            'organization_id' => $orgId,
            'hold_token'      => $token,
            'status'          => 'active',
            'expires_at'      => now()->addDays($daysOffsetFromNow),
            'payload_json'    => json_encode(['guest' => ['name' => 'Test']]),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
    }

    private function seedIdempKey(int $orgId, string $key, int $daysOffsetFromNow): void
    {
        DB::table('booking_idempotency_keys')->insert([
            'organization_id'  => $orgId,
            'idempotency_key'  => $key,
            'request_hash'     => hash('sha256', $key),
            'expires_at'       => now()->addDays($daysOffsetFromNow),
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);
    }

    /* ─── Default retention window (7 days) ─── */

    public function test_holds_older_than_default_window_are_deleted(): void
    {
        // 14-day-old expired holds should disappear with default
        // --days=7. The contract: expires_at < now-7d → delete.
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'hold_old_14d', -14);

        Artisan::call('bookings:prune-holds');

        $remaining = BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_old_14d')
            ->count();
        $this->assertSame(0, $remaining,
            'Hold expired 14d ago MUST be pruned with default --days=7.');
    }

    public function test_active_holds_are_NEVER_deleted(): void
    {
        // CRITICAL: a hold whose expires_at is still in the future
        // is an ACTIVE quote. Pruning it would brick a customer's
        // checkout mid-flight.
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'hold_active_plus3d', 3);

        Artisan::call('bookings:prune-holds');

        $remaining = BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_active_plus3d')
            ->count();
        $this->assertSame(1, $remaining,
            'CRITICAL: active holds (expires_at in future) MUST NOT be pruned.');
    }

    public function test_recently_expired_holds_within_window_stay(): void
    {
        // Within the retention window, holds stay. confirm() may
        // still need to look them up for orphan recovery or
        // post-mortem.
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'hold_old_3d', -3);

        Artisan::call('bookings:prune-holds');

        $remaining = BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_old_3d')
            ->count();
        $this->assertSame(1, $remaining,
            '3d-old hold within the 7d retention window MUST stay.');
    }

    /* ─── Idempotency keys table is independent ─── */

    public function test_idempotency_keys_older_than_default_window_are_deleted(): void
    {
        $org = OrganizationFactory::new()->create();
        $this->seedIdempKey($org->id, 'idemp_old_14d', -14);

        Artisan::call('bookings:prune-holds');

        $remaining = BookingIdempotencyKey::withoutGlobalScopes()
            ->where('idempotency_key', 'idemp_old_14d')
            ->count();
        $this->assertSame(0, $remaining);
    }

    public function test_holds_and_idemp_keys_use_independent_days_options(): void
    {
        // --days controls holds, --idemp-days controls keys.
        // Verify by setting them differently and seeding a row
        // that should be pruned by only one option.
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'hold_5d', -5);
        $this->seedIdempKey($org->id, 'idemp_5d', -5);

        // --days=3 (holds get pruned at 3d threshold), --idemp-days=10
        // (keys stay since 5d < 10d).
        Artisan::call('bookings:prune-holds', [
            '--days'       => 3,
            '--idemp-days' => 10,
        ]);

        $holdsRemain = BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_5d')
            ->count();
        $keysRemain = BookingIdempotencyKey::withoutGlobalScopes()
            ->where('idempotency_key', 'idemp_5d')
            ->count();

        $this->assertSame(0, $holdsRemain,
            '--days=3 must prune 5d-old hold.');
        $this->assertSame(1, $keysRemain,
            '--idemp-days=10 must KEEP 5d-old idempotency key (separate window).');
    }

    /* ─── --dry-run shows count, deletes nothing ─── */

    public function test_dry_run_does_not_delete_anything(): void
    {
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'hold_dryrun_test', -14);
        $this->seedIdempKey($org->id, 'idemp_dryrun_test', -14);

        Artisan::call('bookings:prune-holds', ['--dry-run' => true]);

        $this->assertSame(1, BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_dryrun_test')->count(),
            '--dry-run MUST NOT delete holds.');
        $this->assertSame(1, BookingIdempotencyKey::withoutGlobalScopes()
            ->where('idempotency_key', 'idemp_dryrun_test')->count(),
            '--dry-run MUST NOT delete idempotency keys.');
    }

    public function test_dry_run_reports_counts_in_output(): void
    {
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'h1', -14);
        $this->seedHold($org->id, 'h2', -14);

        Artisan::call('bookings:prune-holds', ['--dry-run' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString('2', $output,
            'Dry-run output MUST surface the count of rows that would be pruned.');
        $this->assertStringContainsString('Dry run', $output,
            'Output MUST clearly mark itself as a dry run.');
    }

    /* ─── Cross-tenant pruning (cron has no tenant context) ─── */

    public function test_prunes_across_tenants_without_global_scope(): void
    {
        // The cron runs in console without a bound tenant. Must use
        // withoutGlobalScopes() to see (and delete) every tenant's
        // expired rows in one sweep. Pre-fix this was a real bug:
        // a tenant-scoped query in console returns ZERO rows,
        // silently doing nothing.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();
        $this->seedHold($orgA->id, 'hold_org_a_expired', -14);
        $this->seedHold($orgB->id, 'hold_org_b_expired', -14);

        Artisan::call('bookings:prune-holds');

        $this->assertSame(0, BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_org_a_expired')->count(),
            'Tenant A row MUST be pruned.');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'hold_org_b_expired')->count(),
            'Tenant B row MUST be pruned (cross-tenant sweep, no scope binding).');
    }

    /* ─── Idempotency on re-run ─── */

    public function test_re_running_on_empty_store_is_no_op(): void
    {
        // After a successful sweep, a second run should delete 0
        // rows and exit successfully. Lets ops re-run the cron
        // any time without consequences.
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'hold_idempotent_1', -14);

        $code1 = Artisan::call('bookings:prune-holds');
        $code2 = Artisan::call('bookings:prune-holds');
        $output2 = Artisan::output();

        $this->assertSame(0, $code1);
        $this->assertSame(0, $code2,
            'Re-run on already-pruned store MUST exit 0.');
        $this->assertStringContainsString('0', $output2,
            'Re-run output MUST surface the 0-row sweep.');
    }

    /* ─── Output reports actual delete counts ─── */

    public function test_output_reports_deleted_row_counts(): void
    {
        $org = OrganizationFactory::new()->create();
        $this->seedHold($org->id, 'h1', -14);
        $this->seedHold($org->id, 'h2', -14);
        $this->seedHold($org->id, 'h3', -14);
        $this->seedIdempKey($org->id, 'k1', -14);

        Artisan::call('bookings:prune-holds');
        $output = Artisan::output();

        $this->assertStringContainsString('Deleted 3 BookingHold', $output);
        $this->assertStringContainsString('1 BookingIdempotencyKey', $output);
    }

    /* ─── Empty store path ─── */

    public function test_empty_store_runs_cleanly(): void
    {
        // No rows at all → must not crash + must report 0 / 0.
        $code = Artisan::call('bookings:prune-holds');

        $this->assertSame(0, $code,
            'Empty-store sweep MUST exit 0 — cron must not page on empty.');
    }
}
