<?php

namespace App\Console\Commands;

use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;

/**
 * Pull a fresh list of reservations from Smoobu, join it against our
 * BookingMirror, and surface every reservation that's:
 *
 *   - in_mirror_synced   — last sync ≥ Smoobu modifiedAt (healthy)
 *   - in_mirror_stale    — last sync < Smoobu modifiedAt (needs re-sync)
 *   - missing_from_mirror — never landed locally
 *
 * Read-only. Safe on prod. The follow-up hint at the bottom is the
 * canonical "rebuild the mirror" command — most operators won't need
 * a custom rescue path because `bookings:sync-pms` paginates through
 * the same Smoobu window.
 *
 * Usage:
 *   php artisan diag:smoobu-vs-mirror --org=12
 *   php artisan diag:smoobu-vs-mirror --org=12 --from=2026-05-01 --to=2026-06-30
 *   php artisan diag:smoobu-vs-mirror --org=12 --json
 */
class DiagSmoobuVsMirror extends Command
{
    protected $signature = 'diag:smoobu-vs-mirror
                            {--org= : Organization id (required)}
                            {--from= : Window start (YYYY-MM-DD), defaults to 30 days ago}
                            {--to= : Window end (YYYY-MM-DD), defaults to today + 365}
                            {--json : Emit machine-readable JSON}';

    protected $description = 'Compare Smoobu reservations vs BookingMirror to surface missing/stale rows.';

    /**
     * Hard cap on the paginated walk. 200 × 50 = 10k reservations per
     * report — generous for any single org and bounded so a runaway
     * Smoobu account can't hang the diagnostic.
     */
    private const MAX_PAGES = 200;
    private const PAGE_SIZE = 50;

    public function handle(SmoobuClient $smoobu): int
    {
        $orgId = (int) $this->option('org');
        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        $from = (string) ($this->option('from') ?: now()->subDays(30)->format('Y-m-d'));
        $to   = (string) ($this->option('to')   ?: now()->addDays(365)->format('Y-m-d'));

        // Bind tenant so SmoobuClient picks up THIS org's API key + so
        // BookingMirror lookups stay scoped.
        app()->instance('current_organization_id', $orgId);

        if ($smoobu->isMock()) {
            $this->warn("Smoobu is in mock mode for org {$orgId} — diagnostic will not be meaningful.");
        }

        $this->info(sprintf(
            'Pulling Smoobu reservations for org %d (%s) from %s to %s...',
            $orgId,
            $org->name,
            $from,
            $to,
        ));

        // 1. Walk every page from Smoobu.
        $smoobuRows = [];
        $page = 1;
        do {
            try {
                $resp = $smoobu->listReservations([
                    'from'                 => $from,
                    'to'                   => $to,
                    'page'                 => $page,
                    'pageSize'             => self::PAGE_SIZE,
                    'showCancellation'     => 1,
                    'includePriceElements' => 0,
                ]);
            } catch (\Throwable $e) {
                $this->error('Smoobu listReservations failed on page ' . $page . ': ' . $e->getMessage());
                return self::FAILURE;
            }

            $batch = $resp['bookings'] ?? [];
            if (!is_array($batch) || empty($batch)) {
                break;
            }
            foreach ($batch as $b) {
                $id = (string) ($b['id'] ?? '');
                if ($id === '') continue;
                $smoobuRows[$id] = [
                    'reservation_id' => $id,
                    'guest_name'     => trim(
                        ($b['guest-name'] ?? '') ?: ((string) ($b['firstName'] ?? '') . ' ' . (string) ($b['lastName'] ?? ''))
                    ),
                    'arrival'        => (string) ($b['arrival'] ?? ''),
                    'departure'      => (string) ($b['departure'] ?? ''),
                    'modified_at'    => (string) ($b['modified-at'] ?? $b['modifiedAt'] ?? ''),
                    'channel'        => (string) ($b['channel']['name'] ?? ''),
                ];
            }

            $pageCount = isset($resp['page_count']) ? (int) $resp['page_count'] : null;
            $returned = count($batch);
            $hasMore = $pageCount !== null ? $page < $pageCount : $returned >= self::PAGE_SIZE;

            if (!$hasMore) break;
            $page++;
        } while ($page <= self::MAX_PAGES);

        $smoobuCount = count($smoobuRows);
        $this->info("Got {$smoobuCount} Smoobu reservation(s). Joining against booking_mirror...");

        // 2. Pull every matching mirror row in one query.
        $smoobuIds = array_keys($smoobuRows);
        $mirrorRows = [];
        if (!empty($smoobuIds)) {
            try {
                $mirrors = BookingMirror::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->whereIn('reservation_id', $smoobuIds)
                    ->get(['reservation_id', 'synced_at', 'source_updated_at']);
                foreach ($mirrors as $m) {
                    $mirrorRows[(string) $m->reservation_id] = [
                        'synced_at'         => optional($m->synced_at)->toIso8601String(),
                        'source_updated_at' => optional($m->source_updated_at)->toIso8601String(),
                    ];
                }
            } catch (\Throwable $e) {
                $this->error('booking_mirror lookup failed: ' . $e->getMessage());
                return self::FAILURE;
            }
        }
        $ourCount = count($mirrorRows);

        // 3. Categorise.
        $missing = [];
        $stale   = [];
        $synced  = [];
        foreach ($smoobuRows as $id => $sr) {
            $mr = $mirrorRows[$id] ?? null;
            if (!$mr) {
                $missing[] = $sr;
                continue;
            }
            // "Stale" = the Smoobu modifiedAt is newer than our synced_at.
            // If we can't compare timestamps (either side missing), default
            // to synced so we don't emit a false positive on a noisy column.
            $smoobuModified = $sr['modified_at'] ? strtotime($sr['modified_at']) : null;
            $localSynced    = !empty($mr['synced_at']) ? strtotime($mr['synced_at']) : null;
            if ($smoobuModified !== null && $localSynced !== null && $smoobuModified > $localSynced) {
                $stale[] = $sr + ['synced_at' => $mr['synced_at']];
            } else {
                $synced[] = $sr + ['synced_at' => $mr['synced_at']];
            }
        }

        if ($this->option('json')) {
            $this->line(json_encode([
                'org_id'              => $orgId,
                'org_name'            => $org->name,
                'window'              => ['from' => $from, 'to' => $to],
                'smoobu_count'        => $smoobuCount,
                'mirror_count'        => $ourCount,
                'missing_count'       => count($missing),
                'stale_count'         => count($stale),
                'synced_count'        => count($synced),
                'missing'             => $missing,
                'stale'               => $stale,
                'generated_at'        => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return (count($missing) + count($stale)) > 0 ? self::FAILURE : self::SUCCESS;
        }

        // 4. Pretty summary table.
        $this->newLine();
        $this->table(
            ['Metric', 'Value'],
            [
                ['Smoobu reservations',     $smoobuCount],
                ['Our mirror count',        $ourCount],
                ['Missing from mirror',     count($missing)],
                ['Stale in mirror',         count($stale)],
                ['In sync',                 count($synced)],
            ],
        );

        if (!empty($missing)) {
            $this->newLine();
            $this->warn('Missing from mirror:');
            $rows = [];
            foreach ($missing as $m) {
                $rows[] = [
                    $m['reservation_id'],
                    $m['guest_name'] ?: '—',
                    $m['arrival'] ?: '—',
                    $m['departure'] ?: '—',
                    $m['channel'] ?: '—',
                ];
            }
            $this->table(['Reservation ID', 'Guest', 'Arrival', 'Departure', 'Channel'], $rows);
        }

        if (!empty($stale)) {
            $this->newLine();
            $this->warn('Stale in mirror (Smoobu modified after our last sync):');
            $rows = [];
            foreach ($stale as $s) {
                $rows[] = [
                    $s['reservation_id'],
                    $s['guest_name'] ?: '—',
                    $s['modified_at'] ?: '—',
                    $s['synced_at'] ?: '—',
                ];
            }
            $this->table(['Reservation ID', 'Guest', 'Smoobu modified', 'Our last sync'], $rows);
        }

        if (count($missing) > 0 || count($stale) > 0) {
            $this->newLine();
            $this->warn('Suggested rescue command:');
            $this->line("  php artisan bookings:sync-pms --org={$orgId}");
            $this->line("  (the sync command walks the same window via Smoobu pagination; it will fill missing rows + refresh stale ones)");
        }

        return (count($missing) + count($stale)) > 0 ? self::FAILURE : self::SUCCESS;
    }
}
