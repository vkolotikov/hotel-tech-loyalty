<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\BookingSubmission;
use App\Models\Organization;
use App\Models\RefundAttempt;
use App\Models\SmoobuWebhookEvent;
use App\Scopes\IntegrationDataScope;
use App\Scopes\TenantScope;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Dump the full provenance of a specific BookingMirror row — what changed
 * it, when, and why. Used to investigate "ghost cancellations" where a
 * booking shows up as cancelled and we need to know whether Smoobu
 * pushed that state via webhook or we wrote it locally (admin refund,
 * dispute close, manual status change, retry-cron failure, etc.).
 *
 * The command is read-only and defensive: every section runs in its own
 * try/catch so a missing column or missing table on a partial deploy
 * doesn't kill the whole report. Defaults to a human-readable text dump
 * with section headers; --json emits a structured payload for piping
 * into jq.
 *
 * Org binding: resolved from the mirror's organization_id by default.
 * --org-id overrides — useful when the mirror's org column itself is
 * suspect (e.g. cross-tenant attribution bug investigation).
 *
 * Usage:
 *   php artisan diag:booking-history 1742
 *   php artisan diag:booking-history 1742 --org-id=42
 *   php artisan diag:booking-history 1742 --json | jq
 */
class DiagBookingHistory extends Command
{
    protected $signature = 'diag:booking-history
                            {mirror_id : The BookingMirror primary key to investigate}
                            {--org-id= : Override the org binding (otherwise taken from the mirror row)}
                            {--json : Emit structured JSON instead of human-readable text}';

    protected $description = 'Dump the full provenance of a BookingMirror row — audit, webhooks, submissions, refunds.';

    /** Trim point for big jsonb / text dumps inside table rows. */
    private const META_TRUNCATE = 500;

    private bool $jsonMode = false;

    /** @var array<string, mixed> */
    private array $payload = [];

    public function handle(): int
    {
        $this->jsonMode = (bool) $this->option('json');

        $mirrorId = (int) $this->argument('mirror_id');
        if ($mirrorId <= 0) {
            $this->emitError('mirror_id must be a positive integer.');
            return self::FAILURE;
        }

        // ── 1. Load the BookingMirror cross-tenant first so we can derive the org. ────────
        // BookingMirror carries two global scopes (TenantScope + IntegrationDataScope).
        // We bypass both so a disabled Smoobu integration or unbound tenant doesn't
        // turn a real row into "not found".
        $mirror = null;
        try {
            $mirror = BookingMirror::query()
                ->withoutGlobalScope(TenantScope::class)
                ->withoutGlobalScope(IntegrationDataScope::class)
                ->find($mirrorId);
        } catch (\Throwable $e) {
            $this->emitError("Could not load BookingMirror #{$mirrorId}: {$e->getMessage()}");
            return self::FAILURE;
        }

        if (!$mirror) {
            $this->emitError("BookingMirror #{$mirrorId} not found (checked cross-tenant).");
            return self::FAILURE;
        }

        // ── 2. Resolve org binding. Explicit --org-id wins; otherwise use the mirror's. ──
        $orgId = $this->option('org-id') !== null
            ? (int) $this->option('org-id')
            : (int) $mirror->organization_id;

        if ($orgId <= 0) {
            $this->emitError('Could not resolve an organization id. Pass --org-id=N explicitly.');
            return self::FAILURE;
        }

        $org = null;
        try {
            $org = Organization::withoutGlobalScope(TenantScope::class)->find($orgId);
        } catch (\Throwable $e) {
            // Non-fatal — we can still run the report without the friendly org name.
        }

        // Bind tenant context so any downstream BelongsToOrganization queries land in
        // the right place. Diagnostic commands don't run TenantMiddleware otherwise.
        app()->instance('current_organization_id', $orgId);

        $this->payload['header'] = [
            'mirror_id'       => $mirrorId,
            'organization_id' => $orgId,
            'organization'    => $org?->name,
            'generated_at'    => now()->toIso8601String(),
        ];

        if (!$this->jsonMode) {
            $this->line('');
            $this->line('<fg=cyan;options=bold>=== BookingMirror provenance report ===</>');
            $this->line("  mirror_id:       <fg=yellow>#{$mirrorId}</>");
            $this->line("  organization_id: <fg=yellow>{$orgId}</>" . ($org ? " ({$org->name})" : ''));
            $this->line('  generated_at:    ' . now()->toIso8601String());
        }

        // ── 3. Run each section behind its own guard. Order matters: mirror dump first    ─
        //     so the reservation_id / payment_intent_id we extract feeds later sections.  ─
        $reservationId    = trim((string) ($mirror->reservation_id ?? ''));
        $paymentIntentId  = trim((string) ($mirror->stripe_payment_intent_id ?? ''));
        $bookingReference = trim((string) ($mirror->booking_reference ?? ''));
        $guestEmail       = trim((string) ($mirror->guest_email ?? ''));

        $this->section('mirror', fn () => $this->dumpMirror($mirror));
        $this->section('audit_logs', fn () => $this->dumpAuditLogs($mirrorId, $reservationId, $bookingReference));
        $this->section('smoobu_webhooks', fn () => $this->dumpSmoobuWebhooks($reservationId));
        $this->section('booking_submissions', fn () => $this->dumpBookingSubmissions($reservationId, $guestEmail, $bookingReference));
        $this->section('refund_attempts', fn () => $this->dumpRefundAttempts($mirrorId, $paymentIntentId));

        if ($this->jsonMode) {
            $this->line(json_encode($this->payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        }

        return self::SUCCESS;
    }

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Sections
    // ─────────────────────────────────────────────────────────────────────────────────────

    /**
     * SECTION 1 — BookingMirror row dump.
     *
     * Pulls every column. The three status fields are surfaced prominently with
     * an inline explanation because the difference between them is the whole
     * point of this diag (PMS-side state vs our sync pipeline vs Stripe).
     */
    private function dumpMirror(BookingMirror $mirror): array
    {
        // Raw attributes (no accessor magic) for the JSON payload + table dump.
        $attrs = $mirror->getAttributes();

        // Decode the raw_json column if it's stored as text — we want jsonb-style display.
        $rawJson = $attrs['raw_json'] ?? null;
        if (is_string($rawJson)) {
            $decoded = json_decode($rawJson, true);
            if (is_array($decoded)) {
                $attrs['raw_json'] = $decoded;
            }
        }

        $statuses = [
            'booking_state'   => $mirror->booking_state ?? null,
            'internal_status' => $mirror->internal_status ?? null,
            'payment_status'  => $mirror->payment_status ?? null,
        ];

        $section = [
            'statuses'        => $statuses,
            'statuses_legend' => [
                'booking_state'   => 'PMS-side intent (confirmed / cancelled / etc.) — what Smoobu thinks',
                'internal_status' => 'Our sync pipeline state (confirmed / pending_pms_sync / pms_sync_failed)',
                'payment_status'  => 'Stripe-side state (paid / refunded / disputed / mock / etc.)',
            ],
            'columns'         => $attrs,
        ];

        if (!$this->jsonMode) {
            $this->headerLine('1. BookingMirror row');

            // Prominent status block first.
            $this->line('  <fg=cyan;options=bold>STATUS TRIO</> (the diff between these usually tells the story):');
            $this->line('    booking_state    = ' . $this->highlight($statuses['booking_state']) . '  <fg=gray>// PMS-side intent (Smoobu)</>');
            $this->line('    internal_status  = ' . $this->highlight($statuses['internal_status']) . '  <fg=gray>// our sync pipeline</>');
            $this->line('    payment_status   = ' . $this->highlight($statuses['payment_status']) . '  <fg=gray>// Stripe side</>');
            $this->line('');

            // Then every other column in a key: value block. raw_json + jsonb cols get pretty-printed.
            $this->line('  <fg=cyan;options=bold>ALL COLUMNS:</>');
            foreach ($attrs as $col => $val) {
                $this->line('    ' . str_pad($col, 26) . ' = ' . $this->renderScalar($val));
            }
        }

        return $section;
    }

    /**
     * SECTION 2 — audit_logs that touched this booking.
     *
     * Audit log schema (loyalty backend) is morph-based: subject_type + subject_id.
     * Mirror writes land as subject_type='App\Models\BookingMirror', subject_id=N.
     * But some downstream side-effects (refund, dispute, manual notes) may log
     * against the Stripe charge / reservation_id and mention the mirror only in
     * description or new_values. We catch all three.
     */
    private function dumpAuditLogs(int $mirrorId, string $reservationId, string $bookingReference): array
    {
        $since = now()->subDays(90);

        $q = AuditLog::query()
            ->withoutGlobalScope(TenantScope::class)
            ->where('created_at', '>=', $since)
            ->where(function ($w) use ($mirrorId, $reservationId, $bookingReference) {
                // 1. Direct morph match.
                $w->where(function ($w2) use ($mirrorId) {
                    $w2->where('subject_type', BookingMirror::class)
                       ->where('subject_id', $mirrorId);
                });

                // 2. description fuzzy match — mirror id, reservation id, or booking reference.
                $w->orWhere('description', 'ILIKE', "%mirror #{$mirrorId}%")
                  ->orWhere('description', 'ILIKE', "%mirror_id={$mirrorId}%")
                  ->orWhere('description', 'ILIKE', "%mirror={$mirrorId}%")
                  ->orWhere('description', 'ILIKE', "%booking #{$mirrorId}%");

                if ($reservationId !== '') {
                    $w->orWhere('description', 'ILIKE', '%' . $reservationId . '%');
                }
                if ($bookingReference !== '') {
                    $w->orWhere('description', 'ILIKE', '%' . $bookingReference . '%');
                }

                // 3. jsonb match — new_values / old_values contain the mirror_id or reservation_id.
                //    Postgres operator @> with the string value. We cast text→jsonb via ->> match.
                $w->orWhereRaw("new_values::text ILIKE ?", ['%"mirror_id":' . $mirrorId . '%'])
                  ->orWhereRaw("new_values::text ILIKE ?", ['%"booking_mirror_id":' . $mirrorId . '%']);
                if ($reservationId !== '') {
                    $w->orWhereRaw("new_values::text ILIKE ?", ['%"reservation_id":"' . $reservationId . '"%'])
                      ->orWhereRaw("new_values::text ILIKE ?", ['%"reservation_id":' . $reservationId . '%']);
                }
            })
            ->orderByDesc('created_at');

        $rows = $q->get();

        $items = $rows->map(function (AuditLog $log) {
            $causer = null;
            if ($log->causer_id) {
                $causer = ($log->causer_type ? class_basename($log->causer_type) : 'unknown') . '#' . $log->causer_id;
            }
            $newValues = $log->new_values ?: [];
            $oldValues = $log->old_values ?: [];
            return [
                'id'           => $log->id,
                'created_at'   => optional($log->created_at)->toIso8601String(),
                'action'       => $log->action,
                'subject'      => $log->subject_type ? class_basename($log->subject_type) . '#' . $log->subject_id : null,
                'causer'       => $causer,
                'ip_address'   => $log->ip_address,
                'description'  => $log->description,
                'old_values'   => $this->truncateForDisplay($oldValues),
                'new_values'   => $this->truncateForDisplay($newValues),
            ];
        })->all();

        if (!$this->jsonMode) {
            $this->headerLine('2. audit_logs (last 90d, ' . count($items) . ' rows)');
            if (empty($items)) {
                $this->line('  <fg=gray>(no audit entries — strong signal that the cancel was NOT logged on our side)</>');
            } else {
                foreach ($items as $r) {
                    $this->line('  <fg=yellow>[' . $r['created_at'] . ']</> action=<fg=cyan>' . $r['action'] . '</>'
                        . ($r['subject'] ? ' subject=' . $r['subject'] : '')
                        . ($r['causer']  ? ' causer=' . $r['causer'] : '')
                        . ($r['ip_address'] ? ' ip=' . $r['ip_address'] : ''));
                    if (!empty($r['description'])) {
                        $this->line('    desc: ' . $r['description']);
                    }
                    if (!empty($r['old_values'])) {
                        $this->line('    old:  ' . $r['old_values']);
                    }
                    if (!empty($r['new_values'])) {
                        $this->line('    new:  ' . $r['new_values']);
                    }
                    $this->line('');
                }
            }
        }

        return ['count' => count($items), 'entries' => $items];
    }

    /**
     * SECTION 3 — smoobu_webhook_events for this reservation_id.
     *
     * If the booking shows cancelled and there's a webhook row carrying that
     * reservation id with action=cancelled, Smoobu pushed it to us. If there's
     * no row but the mirror is cancelled, the cancellation came from our side.
     */
    private function dumpSmoobuWebhooks(string $reservationId): array
    {
        if ($reservationId === '') {
            if (!$this->jsonMode) {
                $this->headerLine('3. smoobu_webhook_events');
                $this->line('  <fg=gray>(no reservation_id on mirror — skipping)</>');
            }
            return ['skipped' => 'no reservation_id on mirror'];
        }

        $rows = SmoobuWebhookEvent::query()
            ->where('reservation_id', $reservationId)
            ->where('received_at', '>=', now()->subDays(90))
            ->orderByDesc('received_at')
            ->get();

        $items = $rows->map(fn (SmoobuWebhookEvent $e) => [
            'id'              => $e->id,
            'received_at'     => optional($e->received_at)->toIso8601String(),
            'action'          => $e->action,
            'reservation_id'  => $e->reservation_id,
            'organization_id' => $e->organization_id,
            'body_hash'       => $e->body_hash,
        ])->all();

        if (!$this->jsonMode) {
            $this->headerLine('3. smoobu_webhook_events (reservation_id=' . $reservationId . ', last 90d, ' . count($items) . ' rows)');
            if (empty($items)) {
                $this->line('  <fg=gray>(no webhooks for this reservation — cancel did NOT come from Smoobu via webhook)</>');
            } else {
                foreach ($items as $r) {
                    $this->line('  <fg=yellow>[' . $r['received_at'] . ']</> action=<fg=cyan>' . ($r['action'] ?? '?') . '</>'
                        . ' org=' . ($r['organization_id'] ?? '?')
                        . ' hash=' . substr($r['body_hash'] ?? '', 0, 12) . '…');
                }
            }
        }

        return ['count' => count($items), 'entries' => $items];
    }

    /**
     * SECTION 4 — BookingSubmission rows that might match.
     *
     * BookingSubmission is the "the guest filled the widget" record — it survives
     * even when the guest never confirms. Match on reservation_id (when we got far
     * enough to assign one), the booking_reference, or the guest email.
     */
    private function dumpBookingSubmissions(string $reservationId, string $guestEmail, string $bookingReference): array
    {
        $q = BookingSubmission::query()
            ->withoutGlobalScope(TenantScope::class)
            ->where('created_at', '>=', now()->subDays(180));

        $q->where(function ($w) use ($reservationId, $guestEmail, $bookingReference) {
            $matched = false;
            if ($reservationId !== '') {
                $w->orWhere('reservation_id', $reservationId);
                $matched = true;
            }
            if ($bookingReference !== '') {
                $w->orWhere('booking_reference', $bookingReference);
                $matched = true;
            }
            if ($guestEmail !== '') {
                $w->orWhere('guest_email', $guestEmail);
                $matched = true;
            }
            if (!$matched) {
                // Force empty result instead of "WHERE ()".
                $w->whereRaw('1 = 0');
            }
        });

        $rows = $q->orderByDesc('created_at')->limit(50)->get();

        $items = $rows->map(fn (BookingSubmission $s) => [
            'id'                => $s->id,
            'created_at'        => optional($s->created_at)->toIso8601String(),
            'outcome'           => $s->outcome,
            'failure_code'      => $s->failure_code,
            'failure_message'   => $s->failure_message,
            'booking_reference' => $s->booking_reference,
            'reservation_id'    => $s->reservation_id,
            'guest_email'       => $s->guest_email,
            'guest_name'        => $s->guest_name,
            'check_in'          => optional($s->check_in)->toDateString(),
            'check_out'         => optional($s->check_out)->toDateString(),
            'payment_method'    => $s->payment_method,
            'payment_status'    => $s->payment_status,
            'idempotency_key'   => $s->idempotency_key,
            'request_id'        => $s->request_id,
        ])->all();

        if (!$this->jsonMode) {
            $this->headerLine('4. booking_submissions (last 180d, ' . count($items) . ' rows)');
            if (empty($items)) {
                $this->line('  <fg=gray>(no submissions matched on reservation_id / booking_reference / guest_email)</>');
            } else {
                foreach ($items as $r) {
                    $this->line('  <fg=yellow>[' . $r['created_at'] . ']</> outcome=<fg=cyan>' . ($r['outcome'] ?? '?') . '</>'
                        . ' ref=' . ($r['booking_reference'] ?? '-')
                        . ' resv=' . ($r['reservation_id'] ?? '-')
                        . ' pay=' . ($r['payment_method'] ?? '-') . '/' . ($r['payment_status'] ?? '-'));
                    if ($r['failure_message']) {
                        $this->line('    failure: [' . $r['failure_code'] . '] ' . $r['failure_message']);
                    }
                }
            }
        }

        return ['count' => count($items), 'entries' => $items];
    }

    /**
     * SECTION 5 — refund_attempts for this mirror's payment intent.
     *
     * Table shipped today (2026-05-31). Each row marks a refund attempt that
     * went through BookingRefundService::applyRefund — both admin-initiated
     * and Stripe-webhook-initiated. completed_at populated on success, error
     * populated on failure.
     */
    private function dumpRefundAttempts(int $mirrorId, string $paymentIntentId): array
    {
        if (!Schema::hasTable('refund_attempts')) {
            if (!$this->jsonMode) {
                $this->headerLine('5. refund_attempts');
                $this->line('  <fg=gray>(refund_attempts table not present on this deploy — skipping)</>');
            }
            return ['skipped' => 'refund_attempts table missing'];
        }

        $q = RefundAttempt::query()
            ->withoutGlobalScope(TenantScope::class)
            ->where(function ($w) use ($mirrorId, $paymentIntentId) {
                $w->where('mirror_id', $mirrorId);
                if ($paymentIntentId !== '') {
                    $w->orWhere('payment_intent_id', $paymentIntentId);
                }
            })
            ->orderByDesc('requested_at');

        $rows = $q->get();

        $items = $rows->map(fn (RefundAttempt $a) => [
            'id'                => $a->id,
            'organization_id'   => $a->organization_id,
            'mirror_id'         => $a->mirror_id,
            'payment_intent_id' => $a->payment_intent_id,
            'refund_id'         => $a->refund_id,
            'requested_at'      => optional($a->requested_at)->toIso8601String(),
            'completed_at'      => optional($a->completed_at)->toIso8601String(),
            'error'             => $a->error,
        ])->all();

        if (!$this->jsonMode) {
            $this->headerLine('5. refund_attempts (' . count($items) . ' rows)');
            if (empty($items)) {
                $this->line('  <fg=gray>(no refund attempts recorded for this mirror or payment intent)</>');
            } else {
                foreach ($items as $r) {
                    $status = $r['completed_at']
                        ? '<fg=green>completed</>'
                        : ($r['error'] ? '<fg=red>failed</>' : '<fg=yellow>in-flight</>');
                    $this->line('  <fg=yellow>[' . $r['requested_at'] . ']</> ' . $status
                        . ' mirror=' . $r['mirror_id']
                        . ' pi=' . $r['payment_intent_id']
                        . ' refund=' . ($r['refund_id'] ?? '-'));
                    if ($r['error']) {
                        $this->line('    error: ' . $r['error']);
                    }
                }
            }
        }

        return ['count' => count($items), 'entries' => $items];
    }

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────────────────

    /**
     * Run a section block, capture its return into the JSON payload, swallow any
     * throw with an inline error so a missing column doesn't kill the whole report.
     */
    private function section(string $key, callable $fn): void
    {
        try {
            $this->payload['sections'][$key] = $fn();
        } catch (\Throwable $e) {
            $err = [
                'error'   => $e::class . ': ' . $e->getMessage(),
                'file'    => str_replace(base_path() . DIRECTORY_SEPARATOR, '', $e->getFile()) . ':' . $e->getLine(),
            ];
            $this->payload['sections'][$key] = $err;
            if (!$this->jsonMode) {
                $this->line('');
                $this->line("  <fg=red>!! section '{$key}' failed: {$err['error']}</>");
                $this->line('     at ' . $err['file']);
            }
        }
    }

    private function headerLine(string $label): void
    {
        $this->line('');
        $this->line('<fg=cyan;options=bold>── ' . $label . ' ──────────────────────────────────────────</>');
    }

    private function emitError(string $msg): void
    {
        if ($this->jsonMode) {
            $this->line(json_encode(['error' => $msg], JSON_PRETTY_PRINT));
        } else {
            $this->error($msg);
        }
    }

    /**
     * Format a column value for the text dump. Arrays + objects get pretty-printed
     * jsonb-style and indented; scalars + nulls render inline.
     */
    private function renderScalar(mixed $val): string
    {
        if ($val === null) {
            return '<fg=gray>NULL</>';
        }
        if (is_bool($val)) {
            return $val ? '<fg=green>true</>' : '<fg=red>false</>';
        }
        if (is_array($val) || is_object($val)) {
            $json = json_encode($val, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                return '[unencodable]';
            }
            // Indent every line after the first by 30 spaces so it lines up under " = ".
            $indented = preg_replace('/\n/', "\n" . str_repeat(' ', 30), $json);
            return $indented ?? $json;
        }
        $s = (string) $val;
        if (Str::length($s) > 500) {
            $s = Str::limit($s, 500);
        }
        return $s;
    }

    /** Highlight non-null status strings; null shows as a neutral marker. */
    private function highlight(mixed $val): string
    {
        if ($val === null || $val === '') {
            return '<fg=gray>NULL</>';
        }
        return '<fg=yellow;options=bold>' . (string) $val . '</>';
    }

    /**
     * Stringify a jsonb / array value for one-line row output, truncating at
     * META_TRUNCATE chars so a 50 KB raw_json doesn't blow up the terminal.
     */
    private function truncateForDisplay(mixed $val): ?string
    {
        if ($val === null || $val === [] || $val === '') {
            return null;
        }
        if (!is_string($val)) {
            $val = json_encode($val, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        if (!is_string($val)) {
            return null;
        }
        return Str::limit($val, self::META_TRUNCATE);
    }
}
