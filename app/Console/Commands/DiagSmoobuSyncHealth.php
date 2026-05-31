<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ScheduledCommandRun;
use App\Models\User;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Surface the actual reason Smoobu auto-sync has stopped firing for one
 * or all orgs. Joins data points from:
 *
 *   - hotel_settings (per-org Smoobu API key presence + decryption)
 *   - booking_mirror (last successful mirror upsert per org)
 *   - scheduled_command_runs (last attempt + last success + 24h counts)
 *   - cache_locks (pending withoutOverlapping locks that block next run)
 *   - audit_logs (sync failure trail, action like 'booking.sync%failed')
 *   - SmoobuClient ping (live /me probe per org, 200/401/5xx/timeout)
 *
 * Usage:
 *   php artisan diag:smoobu-sync-health
 *   php artisan diag:smoobu-sync-health --org=12
 *   php artisan diag:smoobu-sync-health --email=admin@example.com
 *   php artisan diag:smoobu-sync-health --json
 *
 * Safe on prod: no writes, only reads + a single read-only Smoobu /me call
 * per org. Respects multi-tenancy — every cross-tenant query uses
 * withoutGlobalScopes() and rebinds current_organization_id per-org like
 * SendBirthdayRewards.
 */
class DiagSmoobuSyncHealth extends Command
{
    protected $signature = 'diag:smoobu-sync-health
                            {--org= : Limit to a single organization id}
                            {--email= : Resolve org via this owner email}
                            {--json : Emit machine-readable JSON instead of a table}';

    protected $description = 'Diagnose why Smoobu auto-sync has stopped firing for one or all orgs.';

    public function handle(): int
    {
        $orgFilter = $this->resolveOrgFilter();
        if ($orgFilter === false) {
            return self::FAILURE;
        }

        $rows = [];
        $query = Organization::query();
        if ($orgFilter !== null) {
            $query->where('id', $orgFilter);
        }

        $cacheDriver = config('cache.default');

        $query->orderBy('id')->chunkById(50, function ($orgs) use (&$rows, $cacheDriver) {
            foreach ($orgs as $org) {
                $rows[] = $this->inspectOrg($org, $cacheDriver);
            }
        });

        if (empty($rows)) {
            $msg = 'No matching organizations found.';
            if ($this->option('json')) {
                $this->line(json_encode(['error' => $msg], JSON_PRETTY_PRINT));
            } else {
                $this->warn($msg);
            }
            return self::FAILURE;
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'cache_store'   => $cacheDriver,
                'generated_at'  => now()->toIso8601String(),
                'orgs'          => $rows,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return self::SUCCESS;
        }

        $this->renderTable($rows, $cacheDriver);
        return self::SUCCESS;
    }

    /**
     * Resolve the org filter:
     *   --org=ID  → that id
     *   --email   → org_id of the matching User (errors when ambiguous)
     *   neither   → null (scan every org)
     *
     * Returns false on hard failure (bad email, no match, ambiguous).
     */
    private function resolveOrgFilter(): int|null|false
    {
        $org = $this->option('org');
        $email = $this->option('email');

        if ($org) {
            return (int) $org;
        }

        if ($email) {
            $users = User::query()
                ->where('email', $email)
                ->whereNotNull('organization_id')
                ->get(['id', 'organization_id', 'name']);

            if ($users->isEmpty()) {
                $this->error("No user found with email {$email}.");
                return false;
            }
            $orgIds = $users->pluck('organization_id')->unique()->values();
            if ($orgIds->count() > 1) {
                $this->error('Email matches multiple orgs: ' . $orgIds->implode(', ') . '. Pass --org=ID to disambiguate.');
                return false;
            }
            return (int) $orgIds->first();
        }

        return null;
    }

    /**
     * Build the per-org row. Each section is wrapped in try/catch so a
     * single bad lookup (missing table, decrypt error, etc.) doesn't
     * kill the whole report.
     */
    private function inspectOrg(Organization $org, string $cacheDriver): array
    {
        // Bind tenant the same way TenantMiddleware would, so the
        // SmoobuClient lazy-loads the right key for the ping below.
        app()->instance('current_organization_id', $org->id);
        app()->forgetInstance('current_brand_id');

        $row = [
            'org_id'   => $org->id,
            'name'     => $org->name,
            'slug'     => $org->slug,
        ];

        // 1. Provider config presence + decryptability.
        $row['provider'] = $this->inspectProvider($org->id);

        // 2. Last successful sync timestamp — best-available proxy.
        $row['last_success'] = $this->inspectLastSuccess($org->id);

        // 3. Last attempted run from scheduled_command_runs.
        $row['last_attempt'] = $this->inspectLastAttempt();

        // 4. 24h success / fail / skipped counts.
        $row['last_24h'] = $this->inspectLast24h();

        // 5. Pending overlap locks blocking next run.
        $row['blocking_locks'] = $this->inspectBlockingLocks();

        // 6. Cache store driver in effect.
        $row['cache_driver'] = $cacheDriver;

        // 7. Last 5 sync.error audit rows (org-scoped).
        $row['recent_errors'] = $this->inspectRecentErrors($org->id);

        // 8. Live Smoobu ping (skipped when no key configured).
        $row['smoobu_ping'] = $this->pingSmoobu($org->id, $row['provider']);

        app()->forgetInstance('current_organization_id');
        return $row;
    }

    private function inspectProvider(int $orgId): array
    {
        try {
            $row = HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('key', 'booking_smoobu_api_key')
                ->first();

            if (!$row) {
                return ['configured' => false, 'reason' => 'no_hotel_settings_row'];
            }
            // $row->value runs the decrypt accessor.
            $value = $row->value;
            if ($value === null || $value === '') {
                return ['configured' => false, 'reason' => 'empty_value'];
            }
            return [
                'configured'        => true,
                'key_length'        => mb_strlen((string) $value),
                'decrypt_succeeded' => true,
            ];
        } catch (\Throwable $e) {
            return [
                'configured'        => false,
                'reason'            => 'decrypt_or_query_failed',
                'error'             => mb_substr($e->getMessage(), 0, 200),
            ];
        }
    }

    /**
     * Last successful sync timestamp. Prefer a dedicated org column if
     * the schema ever grows one. Today we proxy via the most-recent
     * BookingMirror.synced_at, falling back to the latest
     * 'bookings:sync-pms' success in scheduled_command_runs.
     */
    private function inspectLastSuccess(int $orgId): array
    {
        $out = ['source' => null, 'at' => null];

        try {
            if (\Schema::hasColumn('organizations', 'last_smoobu_sync_at')) {
                $org = Organization::find($orgId);
                if ($org && $org->last_smoobu_sync_at) {
                    return ['source' => 'organizations.last_smoobu_sync_at', 'at' => (string) $org->last_smoobu_sync_at];
                }
            }
        } catch (\Throwable) {
            // fall through
        }

        try {
            $latest = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereNotNull('synced_at')
                ->orderByDesc('synced_at')
                ->value('synced_at');
            if ($latest) {
                return ['source' => 'booking_mirror.synced_at', 'at' => (string) $latest];
            }
        } catch (\Throwable $e) {
            $out['error'] = mb_substr($e->getMessage(), 0, 200);
        }

        try {
            $latestRun = ScheduledCommandRun::where('command', 'bookings:sync-pms')
                ->where('status', 'success')
                ->orderByDesc('id')
                ->value('finished_at');
            if ($latestRun) {
                return ['source' => 'scheduled_command_runs(success)', 'at' => (string) $latestRun];
            }
        } catch (\Throwable $e) {
            $out['error'] = mb_substr($e->getMessage(), 0, 200);
        }

        return $out;
    }

    private function inspectLastAttempt(): array
    {
        try {
            $latest = ScheduledCommandRun::where('command', 'bookings:sync-pms')
                ->orderByDesc('id')
                ->first();
            if (!$latest) {
                return ['at' => null, 'status' => 'never_observed'];
            }
            return [
                'at'             => (string) $latest->finished_at,
                'status'         => (string) $latest->status,
                'duration_ms'    => $latest->duration_ms,
                'error_excerpt'  => $latest->status === 'failed'
                    ? mb_substr((string) $latest->output_excerpt, 0, 500)
                    : null,
            ];
        } catch (\Throwable $e) {
            return [
                'at'    => null,
                'error' => mb_substr($e->getMessage(), 0, 200),
            ];
        }
    }

    private function inspectLast24h(): array
    {
        try {
            $since = now()->subDay();
            $base  = ScheduledCommandRun::where('command', 'bookings:sync-pms')
                ->where('finished_at', '>=', $since);

            return [
                'success' => (clone $base)->where('status', 'success')->count(),
                'failed'  => (clone $base)->where('status', 'failed')->count(),
                'skipped' => (clone $base)->where('status', 'skipped')->count(),
            ];
        } catch (\Throwable $e) {
            return ['error' => mb_substr($e->getMessage(), 0, 200)];
        }
    }

    /**
     * Look for cache_locks rows whose key references the sync command.
     * Laravel's withoutOverlapping() generates lock keys under the
     * 'framework/schedule-' prefix and the cache store's own prefix.
     */
    private function inspectBlockingLocks(): array
    {
        try {
            if (!\Schema::hasTable('cache_locks')) {
                return ['cache_locks_table' => false, 'rows' => []];
            }
            $rows = DB::table('cache_locks')
                ->where(function ($q) {
                    $q->where('key', 'like', '%framework/schedule-%')
                      ->orWhere('key', 'like', '%bookings-sync-pms%')
                      ->orWhere('key', 'like', '%SyncSmoobuBookings%')
                      ->orWhere('key', 'like', '%bookings:sync-pms%');
                })
                ->limit(20)
                ->get(['key', 'owner', 'expiration'])
                ->map(function ($r) {
                    return [
                        'key'        => $r->key,
                        'owner'      => $r->owner,
                        'expires_at' => is_numeric($r->expiration)
                            ? date('c', (int) $r->expiration)
                            : (string) $r->expiration,
                    ];
                })
                ->all();
            return ['cache_locks_table' => true, 'rows' => $rows];
        } catch (\Throwable $e) {
            return ['error' => mb_substr($e->getMessage(), 0, 200)];
        }
    }

    /**
     * Pull the org's most-recent sync-error audit rows. Walks any
     * action that looks like a Smoobu sync failure to stay robust as
     * naming evolves (booking.sync_cron_failed, smoobu.sync.error, etc).
     */
    private function inspectRecentErrors(int $orgId): array
    {
        try {
            $rows = AuditLog::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where(function ($q) {
                    $q->where('action', 'like', 'booking.sync%failed%')
                      ->orWhere('action', 'like', 'smoobu.sync%error%')
                      ->orWhere('action', 'like', 'smoobu.sync%failed%')
                      ->orWhere('action', 'like', '%smoobu.error%');
                })
                ->orderByDesc('id')
                ->limit(5)
                ->get(['id', 'action', 'description', 'created_at']);

            return $rows->map(fn ($r) => [
                'id'          => (int) $r->id,
                'action'      => (string) $r->action,
                'description' => mb_substr((string) $r->description, 0, 300),
                'created_at'  => (string) $r->created_at,
            ])->all();
        } catch (\Throwable $e) {
            return [['error' => mb_substr($e->getMessage(), 0, 200)]];
        }
    }

    /**
     * Hit GET /reservations?page=1&pageSize=1 — cheapest read endpoint
     * that's guaranteed to require a valid Api-Key. Wraps every layer
     * of failure so a network glitch can't mask the real diagnosis.
     */
    private function pingSmoobu(int $orgId, array $provider): array
    {
        if (empty($provider['configured'])) {
            return ['status' => 'skipped', 'reason' => 'no_api_key'];
        }

        try {
            /** @var SmoobuClient $client */
            $client = app(SmoobuClient::class);
            if ($client->isMock()) {
                return ['status' => 'skipped', 'reason' => 'mock_mode'];
            }
            $started = microtime(true);
            $resp    = $client->listReservations(['page' => 1, 'pageSize' => 1]);
            $ms      = (int) round((microtime(true) - $started) * 1000);
            return [
                'status'      => 'ok',
                'http'        => 200,
                'duration_ms' => $ms,
                'sample_count'=> isset($resp['bookings']) && is_array($resp['bookings']) ? count($resp['bookings']) : null,
            ];
        } catch (\RuntimeException $e) {
            // SmoobuClient::request throws "Smoobu API error: {status}".
            $msg = $e->getMessage();
            if (preg_match('/Smoobu API error:\s*(\d+)/', $msg, $m)) {
                $code = (int) $m[1];
                return [
                    'status' => $code === 401 ? 'unauthorized' : ($code >= 500 ? 'server_error' : 'http_error'),
                    'http'   => $code,
                    'error'  => $msg,
                ];
            }
            return ['status' => 'error', 'error' => mb_substr($msg, 0, 300)];
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $type = preg_match('/timed?[\s_]?out|cURL error 28|timeout/i', $msg) ? 'timeout' : 'error';
            return [
                'status' => $type,
                'error'  => mb_substr((string) $e::class . ': ' . $msg, 0, 300),
            ];
        }
    }

    private function renderTable(array $rows, string $cacheDriver): void
    {
        $this->line("<info>Cache store in effect:</info> {$cacheDriver}");
        $this->newLine();

        $tableRows = [];
        foreach ($rows as $r) {
            $providerOk    = !empty($r['provider']['configured']) ? '<fg=green>yes</>' : '<fg=red>NO</>';
            $providerNote  = $r['provider']['reason'] ?? '';
            $lastSuccess   = $r['last_success']['at'] ?? '—';
            $lastSuccessIn = $r['last_success']['source'] ?? '—';
            $lastAttempt   = $r['last_attempt']['at'] ?? '—';
            $attemptStatus = $r['last_attempt']['status'] ?? '—';
            $h24 = $r['last_24h'];
            $h24Str = isset($h24['error'])
                ? '<fg=red>err</>'
                : sprintf('s:%d f:%d sk:%d', $h24['success'] ?? 0, $h24['failed'] ?? 0, $h24['skipped'] ?? 0);
            $locks = isset($r['blocking_locks']['rows']) ? count($r['blocking_locks']['rows']) : 0;
            $ping  = $r['smoobu_ping']['status'] ?? '—';
            $pingHttp = $r['smoobu_ping']['http'] ?? null;
            $pingStr = $pingHttp ? "{$ping} ({$pingHttp})" : $ping;

            $tableRows[] = [
                "#{$r['org_id']} {$r['name']}",
                "{$providerOk}" . ($providerNote ? "\n{$providerNote}" : ''),
                "{$lastSuccess}\n<fg=gray>via {$lastSuccessIn}</>",
                "{$lastAttempt}\n<fg=gray>{$attemptStatus}</>",
                $h24Str,
                $locks > 0 ? "<fg=yellow>{$locks}</>" : '0',
                $this->colorPing($ping, $pingStr),
            ];
        }

        $this->table(
            ['Org', 'Provider', 'Last success', 'Last attempt', '24h s/f/sk', 'Locks', 'Smoobu ping'],
            $tableRows
        );

        foreach ($rows as $r) {
            $errExcerpt = $r['last_attempt']['error_excerpt'] ?? null;
            if ($errExcerpt) {
                $this->newLine();
                $this->warn("Org #{$r['org_id']} last cron error:");
                $this->line('  ' . $errExcerpt);
            }
            if (!empty($r['recent_errors'])) {
                $this->newLine();
                $this->warn("Org #{$r['org_id']} recent audit errors:");
                foreach ($r['recent_errors'] as $e) {
                    if (isset($e['error'])) {
                        $this->line('  <fg=red>err:</> ' . $e['error']);
                    } else {
                        $this->line(sprintf('  [%s] %s — %s', $e['created_at'], $e['action'], $e['description']));
                    }
                }
            }
            $pingErr = $r['smoobu_ping']['error'] ?? null;
            if ($pingErr) {
                $this->newLine();
                $this->warn("Org #{$r['org_id']} Smoobu ping error:");
                $this->line('  ' . $pingErr);
            }
        }
    }

    private function colorPing(string $status, string $pingStr): string
    {
        return match ($status) {
            'ok'           => "<fg=green>{$pingStr}</>",
            'unauthorized' => "<fg=red>{$pingStr}</>",
            'server_error',
            'http_error',
            'timeout',
            'error'        => "<fg=red>{$pingStr}</>",
            'skipped'      => "<fg=gray>{$pingStr}</>",
            default        => $pingStr,
        };
    }
}
