<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Organization;
use Illuminate\Console\Command;

/**
 * Pull recent /confirm failures from audit_logs and surface the EXACT
 * verbatim error that Smoobu (or another source) returned — without
 * grepping `laravel.log` by hand.
 *
 * Reads three audit action families:
 *   - `booking.confirm.failed`    — the structured failure row written by
 *     BookingPublicController::logConfirmFailureWithContext() (carries
 *     `original_message` + `original_exception_class` + `file_line`).
 *   - `booking.confirm.pi_*`      — rescue outcomes (cancelled / refunded /
 *     restricted_key / rescue_failed) for cross-reference.
 *   - `booking.sync_cron_failed`  — orphan booking retry-cron failures.
 *
 * Also prints a "Smoobu rejection patterns" summary: counts of distinct
 * error messages so the operator can see which Smoobu error is most
 * common (e.g. "channel id missing" × 17 vs "guest email required" × 1).
 *
 * Read-only. Safe on prod.
 *
 * Usage:
 *   php artisan diag:recent-confirm-failures --org=12
 *   php artisan diag:recent-confirm-failures --org=12 --hours=4
 *   php artisan diag:recent-confirm-failures --org=12 --json
 */
class DiagRecentConfirmFailures extends Command
{
    protected $signature = 'diag:recent-confirm-failures
                            {--org= : Organization id (required)}
                            {--hours=4 : Look back window in hours}
                            {--json : Emit machine-readable JSON}';

    protected $description = 'Surface recent /confirm failures with the verbatim Smoobu rejection reason.';

    public function handle(): int
    {
        $orgId = (int) $this->option('org');
        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }

        $hours = max(1, (int) $this->option('hours'));

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant so global scopes auto-filter correctly. AuditLog
        // uses BelongsToOrganization so we still need this.
        app()->instance('current_organization_id', $orgId);

        $since = now()->subHours($hours);

        // Main failure rows. We deliberately use a `LIKE 'booking.confirm.%'`
        // pattern so any future sub-action (e.g. confirm.pi_throttled)
        // shows up automatically.
        $rows = AuditLog::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where(function ($q) {
                $q->where('action', 'like', 'booking.confirm.%')
                    ->orWhere('action', 'booking.synced')
                    ->orWhere('action', 'booking.sync_cron_failed');
            })
            ->where('created_at', '>=', $since)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get(['id', 'action', 'created_at', 'new_values', 'description']);

        $parsed = [];
        $messageCounts = [];

        foreach ($rows as $r) {
            $values = $r->new_values ?? [];
            if (is_string($values)) {
                $decoded = json_decode($values, true);
                $values = is_array($decoded) ? $decoded : [];
            }

            $original = $values['original_message']
                ?? $values['original_error']
                ?? $values['error']
                ?? $r->description
                ?? '';
            $original = (string) $original;

            $parsed[] = [
                'id'         => $r->id,
                'created_at' => $r->created_at?->toIso8601String(),
                'action'     => $r->action,
                'stage'      => $values['stage'] ?? null,
                'unit_id'    => $values['unit_id'] ?? (is_array($values['unit_ids'] ?? null) ? implode('+', $values['unit_ids']) : null),
                'check_in'   => $values['check_in'] ?? null,
                'check_out'  => $values['check_out'] ?? null,
                'pi_id'      => $values['pi_id'] ?? ($values['payment_intent_id'] ?? null),
                'hold_token' => $values['hold_token'] ?? null,
                'guest_email' => $values['guest_email'] ?? null,
                'original_message'         => $original,
                'original_exception_class' => $values['original_exception_class'] ?? ($values['original_class'] ?? null),
                'file_line'  => $values['file_line'] ?? null,
            ];

            // Track distinct error messages for the pattern summary.
            // Trim Stripe PI ids out of the key so "Booking already exists for pi_xxx"
            // and "Booking already exists for pi_yyy" cluster as one pattern.
            if ($original !== '' && str_starts_with((string) $r->action, 'booking.confirm.')) {
                $patternKey = $this->messagePatternKey($original);
                if ($patternKey !== '') {
                    $messageCounts[$patternKey] = ($messageCounts[$patternKey] ?? 0) + 1;
                }
            }
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'org_id'        => $orgId,
                'org_name'      => $org->name,
                'hours'         => $hours,
                'since'         => $since->toIso8601String(),
                'count'         => count($parsed),
                'rows'          => $parsed,
                'message_patterns' => $messageCounts,
                'generated_at'  => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return empty($parsed) ? self::SUCCESS : self::FAILURE;
        }

        $this->info(sprintf(
            'Scanning audit_logs for org %d (%s) since %s (%dh window)...',
            $orgId,
            $org->name,
            $since->toDateTimeString(),
            $hours,
        ));
        $this->newLine();

        if (empty($parsed)) {
            $this->info('No /confirm failures recorded in this window.');
            return self::SUCCESS;
        }

        $tableRows = [];
        foreach ($parsed as $p) {
            $unit = (string) ($p['unit_id'] ?? '');
            $dates = ($p['check_in'] ?? '?') . '→' . ($p['check_out'] ?? '?');
            $tableRows[] = [
                $p['created_at'],
                $this->colorAction($p['action']),
                $unit !== '' ? $unit : '—',
                $dates,
                $p['pi_id'] ?: '—',
                mb_substr((string) $p['original_message'], 0, 120),
                $p['hold_token'] ? mb_substr((string) $p['hold_token'], 0, 14) . '…' : '—',
            ];
        }

        $this->table(
            ['Created', 'Action', 'Unit', 'Dates', 'PI', 'Reason (truncated 120)', 'Hold'],
            $tableRows,
        );

        // ── Pattern summary ────────────────────────────────────────────
        if (!empty($messageCounts)) {
            arsort($messageCounts);
            $this->newLine();
            $this->warn('Smoobu rejection patterns (distinct messages, top first):');
            $patternRows = [];
            foreach ($messageCounts as $msg => $count) {
                $patternRows[] = [$count, mb_substr($msg, 0, 140)];
            }
            $this->table(['#', 'Pattern'], $patternRows);
        }

        $this->newLine();
        $this->line('Next steps:');
        $this->line('  • For a specific PI: php artisan diag:pi-context <pi_id> --org=' . $orgId);
        $this->line('  • To probe Smoobu directly: php artisan diag:smoobu-create-probe --org=' . $orgId . ' --apartment-id=<N> --from=YYYY-MM-DD --to=YYYY-MM-DD');

        return self::FAILURE;
    }

    /**
     * Normalise an error message into a clustering key so distinct
     * payment intents / reservation ids don't fragment the pattern
     * summary. Strips long ids, timestamps, and big numbers.
     */
    private function messagePatternKey(string $msg): string
    {
        $key = $msg;
        // Strip Stripe ids
        $key = preg_replace('/pi_[A-Za-z0-9]+/', 'pi_***', $key) ?? $key;
        $key = preg_replace('/ch_[A-Za-z0-9]+/', 'ch_***', $key) ?? $key;
        // Strip long digit runs (reservation ids, amounts, timestamps)
        $key = preg_replace('/\b\d{5,}\b/', '###', $key) ?? $key;
        // Collapse whitespace
        $key = preg_replace('/\s+/', ' ', $key) ?? $key;
        return trim(mb_substr($key, 0, 240));
    }

    private function colorAction(string $action): string
    {
        return match (true) {
            str_contains($action, 'failed')          => "<fg=red>{$action}</>",
            str_contains($action, 'rescue_failed')   => "<fg=red>{$action}</>",
            str_contains($action, 'restricted_key')  => "<fg=red>{$action}</>",
            str_contains($action, 'pi_cancelled')    => "<fg=yellow>{$action}</>",
            str_contains($action, 'pi_refunded')     => "<fg=yellow>{$action}</>",
            str_contains($action, 'synced')          => "<fg=green>{$action}</>",
            default                                  => $action,
        };
    }
}
