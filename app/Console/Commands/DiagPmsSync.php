<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\SmoobuClient;
use App\Services\BookingEngineService;
use Illuminate\Console\Command;

/**
 * Surface the actual exception from a Smoobu reservation upsert that the
 * 5-min cron + admin "Sync Now" button is silently logging at WARNING
 * level (where Laravel Cloud's default log forwarder doesn't carry it).
 *
 * Pulls the first N reservations from Smoobu using the same code path as
 * the sync, attempts to upsert each one, and prints class + message + a
 * trimmed stack to stdout. No DB writes survive — every attempt runs in a
 * rolled-back transaction so this is safe to run on prod against live data.
 *
 * Usage:
 *   php artisan diag:pms-sync --org=12
 *   php artisan diag:pms-sync --org=12 --limit=3
 */
class DiagPmsSync extends Command
{
    protected $signature = 'diag:pms-sync
                            {--org= : Organization id (required for prod)}
                            {--limit=5 : How many reservations to test}';

    protected $description = 'Surface the actual exception from a Smoobu reservation upsert';

    public function handle(SmoobuClient $smoobu, BookingEngineService $service): int
    {
        $orgId = (int) $this->option('org');
        if (!$orgId) {
            $this->error('--org=<id> is required so the SmoobuClient + tenant scope resolve correctly.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind the tenant context the same way TenantMiddleware does at
        // request time — without it, BookingMirror's BelongsToOrganization
        // trait can't auto-fill organization_id on the upsert, and the
        // global scope returns zero rows for the existence pre-check.
        app()->instance('current_organization_id', $orgId);

        $limit = max(1, (int) $this->option('limit'));
        $this->info("Fetching first {$limit} reservations from Smoobu for org {$orgId} ({$org->name})...");

        $response = $smoobu->listReservations([
            'page'                 => 1,
            'pageSize'             => $limit,
            'showCancellation'     => 1,
            'includePriceElements' => 1,
        ]);
        $bookings = $response['bookings'] ?? [];

        if (empty($bookings)) {
            $this->warn('Smoobu returned 0 reservations. Check the API key + channel id.');
            return self::SUCCESS;
        }

        $this->info('Got ' . count($bookings) . " reservations. Trying upsert (all rolled back)...\n");

        $ok = 0; $fail = 0;
        foreach ($bookings as $idx => $b) {
            $label = "#{$idx} id=" . ($b['id'] ?? '?') . ' arrival=' . ($b['arrival'] ?? '?');
            try {
                \DB::beginTransaction();
                $service->upsertBookingFromData($b);
                \DB::rollBack();
                $this->line("  <fg=green>OK</>  {$label}");
                $ok++;
            } catch (\Throwable $e) {
                \DB::rollBack();
                $fail++;
                $this->line("  <fg=red>FAIL</> {$label}");
                $this->line('       class: ' . $e::class);
                $this->line('       msg:   ' . $e->getMessage());
                if ($e instanceof \Illuminate\Database\QueryException) {
                    $this->line('       sql_state: ' . ($e->errorInfo[0] ?? '?'));
                }
                $this->line('       at:    ' . str_replace(base_path() . DIRECTORY_SEPARATOR, '', $e->getFile()) . ':' . $e->getLine());
                // First 4 frames of caller stack — usually enough to spot the failing column write.
                foreach (array_slice($e->getTrace(), 0, 4) as $f) {
                    $where = isset($f['file']) ? str_replace(base_path() . DIRECTORY_SEPARATOR, '', $f['file']) . ':' . ($f['line'] ?? '?') : '[internal]';
                    $what  = ($f['class'] ?? '') . ($f['type'] ?? '') . ($f['function'] ?? '');
                    $this->line("       trace: {$where}  {$what}");
                }
                $this->newLine();
            }
        }

        $this->newLine();
        $this->info("Done. OK: {$ok}  FAIL: {$fail}");
        return $fail > 0 ? self::FAILURE : self::SUCCESS;
    }
}
