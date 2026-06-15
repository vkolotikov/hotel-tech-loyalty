<?php

namespace Tests\Feature\Settings;

use App\Models\ScheduledCommandRun;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Locks the ScheduledCommandRun model contract — the
 * cron-observability row backing diag:scheduled-health.
 *
 * Why this matters:
 *
 *   The 2026-05-19 ship (CLAUDE.md "Scheduler health + cron lock
 *   fix") added this table to track per-run outcomes for every
 *   scheduled command. The `diag:scheduled-health` artisan command
 *   reads it to surface staleness / failures across the cron
 *   inventory — the operator's only window into "did
 *   bookings:sync-pms actually fire this hour?" without grepping
 *   audit_logs by hand. A regression in any cast surfaces wrong
 *   status / wrong duration / wrong "last fired at".
 *
 *   The 3 canonical statuses (success / failed / skipped) are
 *   stamped by the 3 Laravel events observed in
 *   AppServiceProvider::boot() — never ScheduledTaskStarting, so
 *   writes are atomic and a crashed worker can't leave dangling
 *   'started' rows.
 *
 *   CRITICAL design decision: NO BelongsToOrganization trait.
 *   Scheduled commands run system-wide (one cron container for
 *   all orgs); the row is per-COMMAND not per-tenant. A regression
 *   that adds tenant scope here breaks the diag command silently
 *   (returns 0 rows in console context where no tenant binding
 *   exists).
 *
 *   output_excerpt is truncated to 2000 chars at the writer
 *   (mb_substr) to keep TEXT column sizes predictable across a
 *   5KB Postgres error message. The model-level test locks the
 *   cast contract; the truncation-at-write invariant is tested
 *   at the call site.
 *
 * Contract:
 *
 *   - duration_ms integer cast (drives health-bucket math —
 *     diag:scheduled-health compares against the cron
 *     expression's expected interval).
 *   - started_at + finished_at datetime → Carbon (sort + "last
 *     fired X ago" diffForHumans display).
 *   - 3 canonical status values: success / failed / skipped.
 *   - output_excerpt persists with no truncation at the model
 *     layer (call-site mb_substr is the boundary).
 *   - expression persists the cron expression string ('5 * * * *')
 *     so the diag command can decode "expected every 5 min".
 *   - NO BelongsToOrganization — system-wide table by design.
 */
class ScheduledCommandRunModelTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasTable('scheduled_command_runs')) {
            Schema::create('scheduled_command_runs', function ($t) {
                $t->bigIncrements('id');
                $t->string('command');
                $t->string('expression')->nullable();
                $t->string('status', 32);
                $t->integer('duration_ms')->nullable();
                $t->text('output_excerpt')->nullable();
                $t->timestamp('started_at')->nullable();
                $t->timestamp('finished_at')->nullable();
                $t->timestamps();
                $t->index(['command', 'created_at']);
                $t->index('status');
            });
        }
    }

    /* ─── Datetime casts ─── */

    public function test_started_at_casts_to_carbon(): void
    {
        // CRITICAL: diag:scheduled-health sorts by started_at +
        // computes diffForHumans. A string cast would crash the
        // health-bucket calculation.
        $run = ScheduledCommandRun::create([
            'command'    => 'bookings:sync-pms',
            'status'     => 'success',
            'started_at' => now()->subMinutes(5),
            'finished_at'=> now(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $run->started_at);
    }

    public function test_finished_at_casts_to_carbon(): void
    {
        $run = ScheduledCommandRun::create([
            'command'    => 'subscriptions:expire-trials',
            'status'     => 'success',
            'started_at' => now()->subSeconds(30),
            'finished_at'=> now(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $run->finished_at);
    }

    /* ─── duration_ms integer cast ─── */

    public function test_duration_ms_casts_to_integer(): void
    {
        // CRITICAL: drives the health-bucket math. The diag
        // command compares duration_ms against the cron
        // expression's expected interval to flag SLOW runs.
        // A string cast would crash arithmetic operations.
        $run = ScheduledCommandRun::create([
            'command'     => 'engagement:send-daily-summary',
            'status'      => 'success',
            'duration_ms' => '2500',
        ]);

        $this->assertSame(2500, $run->duration_ms);
        $this->assertIsInt($run->duration_ms);
    }

    public function test_duration_ms_nullable_for_failed_runs(): void
    {
        // ScheduledTaskFailed events don't carry runtime (the
        // exception fired before completion). Lock that null
        // duration_ms is allowed — diag command must not
        // crash on null.
        $run = ScheduledCommandRun::create([
            'command'     => 'bookings:sync-pms',
            'status'      => 'failed',
            'duration_ms' => null,
            'started_at'  => now(),
            'finished_at' => now(),
            'output_excerpt' => 'Smoobu HTTP 503: Service Unavailable',
        ]);

        $this->assertNull($run->fresh()->duration_ms);
    }

    /* ─── 3 canonical status values ─── */

    public function test_canonical_status_values_persist_intact(): void
    {
        // Lock the 3 statuses stamped by the 3 Laravel events
        // observed in AppServiceProvider:
        // - ScheduledTaskFinished → 'success'
        // - ScheduledTaskFailed   → 'failed'
        // - ScheduledTaskSkipped  → 'skipped'
        //
        // CRITICAL: never 'started' (no ScheduledTaskStarting
        // listener) — writes are atomic by design.
        foreach (['success', 'failed', 'skipped'] as $status) {
            $run = ScheduledCommandRun::create([
                'command'    => "test-cmd-{$status}",
                'status'     => $status,
                'started_at' => now(),
                'finished_at'=> now(),
            ]);
            $this->assertSame($status, $run->fresh()->status);
        }
    }

    /* ─── output_excerpt persists at model layer ─── */

    public function test_output_excerpt_persists_without_model_layer_truncation(): void
    {
        // The 2000-char truncation lives at the writer
        // (mb_substr in AppServiceProvider's ScheduledTaskFailed
        // listener). The model layer MUST accept any length the
        // caller passes — TEXT column. Lock that the model
        // doesn't double-truncate.
        $long = str_repeat('A', 1500);

        $run = ScheduledCommandRun::create([
            'command'        => 'failing-cmd',
            'status'         => 'failed',
            'output_excerpt' => $long,
            'started_at'     => now(),
            'finished_at'    => now(),
        ]);

        $this->assertSame(1500, strlen($run->fresh()->output_excerpt),
            'Model MUST persist output_excerpt verbatim (truncation is writer\'s job).');
    }

    public function test_null_output_excerpt_persists_as_null(): void
    {
        // Success + skipped runs typically have null
        // output_excerpt (no error to record). Lock so the
        // diag command's "no error message" branch stays
        // semantic.
        $run = ScheduledCommandRun::create([
            'command'        => 'silent-success',
            'status'         => 'success',
            'output_excerpt' => null,
            'started_at'     => now(),
            'finished_at'    => now(),
        ]);

        $this->assertNull($run->fresh()->output_excerpt);
    }

    /* ─── expression persists cron string ─── */

    public function test_expression_persists_cron_expression_string(): void
    {
        // expression carries the raw cron expression ('5 * * * *')
        // so diag:scheduled-health can decode "expected every 5
        // min" and flag stale runs.
        $run = ScheduledCommandRun::create([
            'command'    => 'bookings:sync-pms',
            'expression' => '*/5 * * * *',
            'status'     => 'success',
            'started_at' => now(),
            'finished_at'=> now(),
        ]);

        $this->assertSame('*/5 * * * *', $run->fresh()->expression);
    }

    public function test_null_expression_persists_as_null(): void
    {
        // Defensive: $event->task->expression may be null on
        // closure-based schedules. Lock null persists so the
        // create() in the listener doesn't crash.
        $run = ScheduledCommandRun::create([
            'command'    => 'closure-scheduled-cmd',
            'expression' => null,
            'status'     => 'success',
            'started_at' => now(),
            'finished_at'=> now(),
        ]);

        $this->assertNull($run->fresh()->expression);
    }

    /* ─── NO BelongsToOrganization trait ─── */

    public function test_does_not_use_belongs_to_organization_trait(): void
    {
        // CRITICAL: system-wide table by design. Scheduled
        // commands run in ONE cron container for ALL orgs;
        // adding tenant scope here would break diag in console
        // context (no current_organization_id bound → 0 rows
        // surfaced).
        $traits = class_uses_recursive(ScheduledCommandRun::class);

        $this->assertNotContains(\App\Traits\BelongsToOrganization::class, $traits,
            'CRITICAL: ScheduledCommandRun MUST NOT use BelongsToOrganization '
            . '— it\'s a system-wide table. Adding the trait silently breaks '
            . 'diag:scheduled-health in console context.');
    }

    public function test_rows_visible_without_tenant_binding(): void
    {
        // Defensive: lock that rows persist + are queryable
        // even when no current_organization_id is bound (the
        // console-command scenario).
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }

        ScheduledCommandRun::create([
            'command'    => 'console-context-cmd',
            'status'     => 'success',
            'started_at' => now(),
            'finished_at'=> now(),
        ]);

        $rows = ScheduledCommandRun::where('command', 'console-context-cmd')->get();
        $this->assertCount(1, $rows,
            'System-wide rows MUST surface without tenant binding.');
    }

    /* ─── Per-command latest run lookup pattern ─── */

    public function test_latest_run_per_command_lookup_pattern(): void
    {
        // diag:scheduled-health uses
        // ScheduledCommandRun::where(command,…)->latest()->first()
        // to surface the most-recent outcome per command. Lock
        // the ordering by created_at desc.
        ScheduledCommandRun::create([
            'command'    => 'multi-run-cmd',
            'status'     => 'success',
            'started_at' => now()->subHours(2),
            'finished_at'=> now()->subHours(2),
        ]);
        $latest = ScheduledCommandRun::create([
            'command'    => 'multi-run-cmd',
            'status'     => 'failed',
            'started_at' => now()->subMinutes(5),
            'finished_at'=> now()->subMinutes(5),
        ]);
        ScheduledCommandRun::create([
            'command'    => 'other-cmd',
            'status'     => 'success',
            'started_at' => now(),
            'finished_at'=> now(),
        ]);

        $row = ScheduledCommandRun::where('command', 'multi-run-cmd')
            ->latest()
            ->first();

        $this->assertSame($latest->id, $row->id,
            'latest() MUST surface the most-recent ScheduledCommandRun for the command.');
        $this->assertSame('failed', $row->status);
    }
}
