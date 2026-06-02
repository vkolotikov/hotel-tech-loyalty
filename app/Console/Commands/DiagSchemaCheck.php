<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Surface schema drift between what the current migration set expects
 * and what's actually live on the database. Catches the "migration
 * didn't run" prod cases that today's Nightwatch overflow rash
 * (visitors.referrer / .user_agent / .current_page / .current_page_title
 * overflowing varchar(N)) suggested might be wider than one column.
 *
 * Exit code 1 when any drift detected so monitoring can alert.
 *
 * Read-only. Walks information_schema.columns + Schema::hasTable. Safe
 * on prod.
 *
 * Usage:
 *   php artisan diag:schema-check
 *   php artisan diag:schema-check --json
 */
class DiagSchemaCheck extends Command
{
    protected $signature = 'diag:schema-check
                            {--json : Emit machine-readable JSON instead of a table}';

    protected $description = 'Verify expected column types + table presence are live on the database.';

    /**
     * Each check entry:
     *   - table:    relation to inspect
     *   - column:   column name (null = "table existence" check)
     *   - expected: short string describing the expected type
     *   - matches:  closure that takes information_schema.columns row and
     *               returns true when the actual type matches expected.
     *   - reason:   optional human-readable rationale.
     */
    private function checks(): array
    {
        // Helpers for matchers
        $isText = fn (array $col): bool => strtolower((string) $col['data_type']) === 'text';

        $expectedTextColumns = [
            ['visitors', 'referrer'],
            ['visitors', 'user_agent'],
            ['visitors', 'current_page'],
            ['visitors', 'current_page_title'],
            ['audit_logs', 'user_agent'],
            ['review_submissions', 'user_agent'],
        ];

        $checks = [];

        foreach ($expectedTextColumns as [$table, $column]) {
            $checks[] = [
                'table'    => $table,
                'column'   => $column,
                'expected' => 'TEXT',
                'matches'  => $isText,
                'reason'   => 'Should be TEXT (was varchar). Overflow risk on bot user-agents / long redirect URLs.',
            ];
        }

        // chat_messages.channel_account_id — should exist (channel integration support)
        $checks[] = [
            'table'    => 'chat_messages',
            'column'   => 'channel_account_id',
            'expected' => 'present',
            'matches'  => fn (array $col): bool => true, // presence-only check; matcher unused
            'reason'   => 'Required for external-channel (Messenger / WhatsApp / Instagram) message ingestion.',
        ];

        // chat_channel_accounts token-health columns (2026-05-31)
        $checks[] = [
            'table'    => 'chat_channel_accounts',
            'column'   => 'token_scopes',
            'expected' => 'present (jsonb)',
            'matches'  => fn (array $col): bool => in_array(strtolower((string) $col['data_type']), ['jsonb', 'json'], true),
            'reason'   => 'FBLB granted-scopes list from /debug_token. Migration 2026_05_31_140000.',
        ];
        $checks[] = [
            'table'    => 'chat_channel_accounts',
            'column'   => 'token_expires_at',
            'expected' => 'present (timestamp)',
            'matches'  => fn (array $col): bool => str_contains(strtolower((string) $col['data_type']), 'timestamp'),
            'reason'   => 'FBLB token expiry. Migration 2026_05_31_140000.',
        ];
        $checks[] = [
            'table'    => 'chat_channel_accounts',
            'column'   => 'data_access_expires_at',
            'expected' => 'present (timestamp)',
            'matches'  => fn (array $col): bool => str_contains(strtolower((string) $col['data_type']), 'timestamp'),
            'reason'   => 'Meta data-access window. Migration 2026_05_31_140000.',
        ];

        // refund_attempts table existence
        $checks[] = [
            'table'    => 'refund_attempts',
            'column'   => null,
            'expected' => 'table exists',
            'matches'  => fn (array $col): bool => true,
            'reason'   => 'Race-safe refund attempt marker. Migration 2026_05_31_130000.',
        ];

        // ─── 2026-06-01 audit-wave migrations ─────────────────────────
        // booking_mirror partial unique on (organization_id, stripe_payment_intent_id)
        // — the constraint orphan-recovery code has always claimed.
        $checks[] = [
            'kind'     => 'index',
            'table'    => 'booking_mirror',
            'index'    => 'booking_mirror_org_pi_unique',
            'expected' => 'unique partial index',
            'reason'   => 'Race-protection for stripeWebhook orphan recovery. Migration 2026_06_01_120000.',
        ];

        // booking_mirror composite index on (organization_id, source_updated_at)
        // for incremental sync.
        $checks[] = [
            'kind'     => 'index',
            'table'    => 'booking_mirror',
            'index'    => 'booking_mirror_org_modified_idx',
            'expected' => 'composite index',
            'reason'   => 'Incremental sync index. Migration 2026_06_01_120100.',
        ];

        // stripe_webhook_events table for event-id dedup.
        $checks[] = [
            'table'    => 'stripe_webhook_events',
            'column'   => null,
            'expected' => 'table exists',
            'matches'  => fn (array $col): bool => true,
            'reason'   => 'Stripe event-id dedup table. Migration 2026_06_01_120200.',
        ];

        // ─── 2026-06-02 extras / Smoobu richness migration ─────────────
        // booking_mirror.extras_json — denormalised snapshot of selected
        // extras (name, qty, unit_price, line_total) at confirm time so
        // orphan recovery + retry sync + emails don't re-resolve from a
        // moving catalog. Combo bookings used to lose extras entirely;
        // this column is the persistence anchor.
        $checks[] = [
            'table'    => 'booking_mirror',
            'column'   => 'extras_json',
            'expected' => 'present (jsonb)',
            'matches'  => fn (array $col): bool => in_array(strtolower((string) $col['data_type']), ['jsonb', 'json'], true),
            'reason'   => 'Extras snapshot for emails + Smoobu priceElements + admin queries. Migration 2026_06_02_120000.',
        ];

        // ─── 2026-06-02 Messenger FBLB connect fix ────────────────────
        // chat_channel_accounts.display_avatar_url widened from
        // varchar(500) to TEXT. Facebook CDN profile-picture URLs
        // are signed (embedded auth tokens) and routinely 700-1500
        // chars, so the old cap rejected every connect attempt with
        // "The avatar url field must not be greater than 500 characters".
        $checks[] = [
            'table'    => 'chat_channel_accounts',
            'column'   => 'display_avatar_url',
            'expected' => 'TEXT',
            'matches'  => $isText,
            'reason'   => 'Facebook Page avatar URLs exceed varchar(500). Migration 2026_06_02_130000.',
        ];

        return $checks;
    }

    public function handle(): int
    {
        $results = [];
        $driftCount = 0;

        foreach ($this->checks() as $check) {
            $row = $this->runCheck($check);
            if ($row['status'] === 'drift' || $row['status'] === 'missing') {
                $driftCount++;
            }
            $results[] = $row;
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'drift_count'  => $driftCount,
                'checks'       => $results,
                'generated_at' => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return $driftCount > 0 ? self::FAILURE : self::SUCCESS;
        }

        $tableRows = [];
        foreach ($results as $r) {
            $tableRows[] = [
                $r['target'],
                $r['expected'],
                $r['actual'],
                $this->colorStatus($r['status']),
            ];
        }
        $this->table(['Target', 'Expected', 'Actual', 'Status'], $tableRows);

        $this->newLine();
        if ($driftCount > 0) {
            $this->warn("Drift detected on {$driftCount} check(s). Run pending migrations: php artisan migrate --force");
            foreach ($results as $r) {
                if ($r['status'] === 'drift' || $r['status'] === 'missing') {
                    $this->line('  - ' . $r['target'] . ': ' . $r['reason']);
                }
            }
        } else {
            $this->info('All schema checks passed.');
        }

        return $driftCount > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Run a single check and return a result row:
     *   target / expected / actual / status (ok | drift | missing | error) / reason
     */
    private function runCheck(array $check): array
    {
        $table  = $check['table'];
        $column = $check['column'] ?? null;
        $kind   = $check['kind'] ?? 'column';
        $index  = $check['index'] ?? null;
        $target = $kind === 'index'
            ? "{$table}[index:{$index}]"
            : ($column ? "{$table}.{$column}" : $table);
        $base = [
            'target'   => $target,
            'expected' => $check['expected'],
            'reason'   => $check['reason'] ?? '',
        ];

        try {
            if (!Schema::hasTable($table)) {
                return $base + [
                    'actual' => '<table missing>',
                    'status' => 'missing',
                ];
            }

            // Index existence check (Postgres pg_indexes).
            if ($kind === 'index' && $index !== null) {
                $exists = DB::table('pg_indexes')
                    ->where('schemaname', DB::raw('current_schema()'))
                    ->where('tablename', $table)
                    ->where('indexname', $index)
                    ->exists();
                return $base + [
                    'actual' => $exists ? 'present' : '<index missing>',
                    'status' => $exists ? 'ok' : 'missing',
                ];
            }

            // Table-existence-only check
            if ($column === null) {
                return $base + [
                    'actual' => 'present',
                    'status' => 'ok',
                ];
            }

            $colInfo = $this->fetchColumnInfo($table, $column);
            if ($colInfo === null) {
                return $base + [
                    'actual' => '<column missing>',
                    'status' => 'missing',
                ];
            }

            $actual = $this->describeActual($colInfo);
            $ok = ($check['matches'])($colInfo);

            return $base + [
                'actual' => $actual,
                'status' => $ok ? 'ok' : 'drift',
            ];
        } catch (\Throwable $e) {
            return $base + [
                'actual' => 'ERROR: ' . mb_substr($e->getMessage(), 0, 200),
                'status' => 'error',
            ];
        }
    }

    /**
     * Look up the column's row from information_schema.columns. Returns
     * an assoc array of lowercase string fields, or null when the column
     * isn't present.
     */
    private function fetchColumnInfo(string $table, string $column): ?array
    {
        $row = DB::table('information_schema.columns')
            ->where('table_schema', DB::raw('current_schema()'))
            ->where('table_name', $table)
            ->where('column_name', $column)
            ->first();
        if (!$row) {
            return null;
        }
        // Cast to lowercase-keyed array for downstream consumption.
        return array_change_key_case((array) $row, CASE_LOWER);
    }

    private function describeActual(array $colInfo): string
    {
        $type = strtolower((string) ($colInfo['data_type'] ?? ''));
        $len  = $colInfo['character_maximum_length'] ?? null;
        if ($len !== null && $len !== '' && in_array($type, ['character varying', 'varchar', 'character', 'char'], true)) {
            return $type . '(' . (int) $len . ')';
        }
        return $type ?: '<unknown>';
    }

    private function colorStatus(string $status): string
    {
        return match ($status) {
            'ok'      => '<fg=green>ok</>',
            'drift'   => '<fg=red>drift</>',
            'missing' => '<fg=red>missing</>',
            'error'   => '<fg=yellow>error</>',
            default   => $status,
        };
    }
}
