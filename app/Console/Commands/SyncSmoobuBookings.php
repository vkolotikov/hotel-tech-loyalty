<?php

namespace App\Console\Commands;

use App\Models\HotelSetting;
use App\Services\BookingEngineService;
use App\Services\IntegrationStatus;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Pull every Smoobu reservation for every org with the integration
 * configured. Runs on a 5-minute cron via routes/console.php so the
 * calendar self-heals even if Smoobu's webhook fails to deliver.
 *
 * Real-time freshness comes from the webhook (BookingPublicController::
 * webhook); this command is the durability backstop. Without it a
 * dropped webhook would leave the mirror stale until staff manually
 * clicked "Sync" — which is exactly how rooms got double-booked
 * before this fix.
 */
class SyncSmoobuBookings extends Command
{
    protected $signature = 'bookings:sync-pms
                            {--from= : Override start date (Y-m-d)}
                            {--to= : Override end date (Y-m-d)}
                            {--org= : Limit to a single organization id}';

    protected $description = 'Sync reservations from Smoobu for every org with the integration configured';

    public function handle(SmoobuClient $smoobu, BookingEngineService $service): int
    {
        if (!IntegrationStatus::isEnabled('smoobu')) {
            $this->info('Smoobu integration is globally disabled — skipping.');
            return self::SUCCESS;
        }

        $orgIds = $this->orgsWithSmoobu();
        if (empty($orgIds)) {
            $this->info('No organizations with Smoobu API key configured.');
            return self::SUCCESS;
        }

        $totalSynced = 0;
        $totalErrors = 0;
        $orgCount = 0;

        foreach ($orgIds as $orgId) {
            // Bind tenant context so SmoobuClient::boot() resolves the
            // per-org API key. The client re-boots when the bound org
            // changes mid-process so iterating is safe.
            app()->instance('current_organization_id', $orgId);

            try {
                if ($smoobu->isMock()) {
                    $this->warn("Org {$orgId}: Smoobu in mock mode, skipping.");
                    continue;
                }

                $result = $service->syncReservationsFromPms(
                    $this->option('from'),
                    $this->option('to'),
                );

                $totalSynced += $result['synced'];
                $totalErrors += $result['errors'];
                $orgCount++;

                $this->info(sprintf(
                    'Org %d: %d synced, %d errors across %d/%d pages (%s → %s).',
                    $orgId,
                    $result['synced'],
                    $result['errors'],
                    $result['pages'],
                    $result['page_count'],
                    $result['from'],
                    $result['to'],
                ));
            } catch (\Throwable $e) {
                Log::error('Scheduled Smoobu sync failed', [
                    'org_id' => $orgId,
                    'error'  => $e->getMessage(),
                ]);
                $this->error("Org {$orgId}: {$e->getMessage()}");
            } finally {
                app()->forgetInstance('current_organization_id');
            }
        }

        $this->info("Done. Total: {$totalSynced} synced, {$totalErrors} errors across {$orgCount} org(s).");
        return self::SUCCESS;
    }

    /**
     * Return organization ids that have a non-empty Smoobu API key set
     * (or just the --org id when explicitly scoped).
     *
     * @return array<int, int>
     */
    private function orgsWithSmoobu(): array
    {
        if ($explicit = $this->option('org')) {
            return [(int) $explicit];
        }

        return HotelSetting::withoutGlobalScopes()
            ->where('key', 'booking_smoobu_api_key')
            ->whereNotNull('value')
            ->where('value', '!=', '')
            ->pluck('organization_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }
}
