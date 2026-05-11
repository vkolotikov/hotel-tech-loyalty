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

        $targets = $this->syncTargets();
        if (empty($targets)) {
            $this->info('No organizations or brands with Smoobu API key configured.');
            return self::SUCCESS;
        }

        $totalSynced = 0;
        $totalErrors = 0;
        $targetCount = 0;

        foreach ($targets as $target) {
            // Bind BOTH the org and the brand (when present). The
            // SmoobuClient resolves per-brand key first, then falls
            // back to org-level — but only if `current_brand_id` is
            // bound. Without this, brand-scoped Smoobu accounts
            // silently never synced and the calendar drifted.
            app()->instance('current_organization_id', $target['org_id']);
            if (!empty($target['brand_id'])) {
                app()->instance('current_brand_id', $target['brand_id']);
            }

            $label = $target['brand_id']
                ? "Org {$target['org_id']} / Brand {$target['brand_id']}"
                : "Org {$target['org_id']}";

            try {
                if ($smoobu->isMock()) {
                    $this->warn("{$label}: Smoobu in mock mode, skipping.");
                    continue;
                }

                $result = $service->syncReservationsFromPms(
                    $this->option('from'),
                    $this->option('to'),
                );

                $totalSynced += $result['synced'];
                $totalErrors += $result['errors'];
                $targetCount++;

                $arr = $result['passes']['arrival_window'] ?? null;
                $mod = $result['passes']['modified_recent'] ?? null;
                $this->info(sprintf(
                    '%s: %d synced (arr:%d mod:%d), %d errors. Window %s → %s, modified ≥ %s.',
                    $label,
                    $result['synced'],
                    $arr['synced'] ?? 0,
                    $mod['synced'] ?? 0,
                    $result['errors'],
                    $result['from'],
                    $result['to'],
                    $result['modified_from'] ?? 'n/a',
                ));
            } catch (\Throwable $e) {
                Log::error('Scheduled Smoobu sync failed', [
                    'org_id'   => $target['org_id'],
                    'brand_id' => $target['brand_id'] ?? null,
                    'error'    => $e->getMessage(),
                ]);
                $this->error("{$label}: {$e->getMessage()}");
            } finally {
                app()->forgetInstance('current_organization_id');
                app()->forgetInstance('current_brand_id');
            }
        }

        $this->info("Done. Total: {$totalSynced} synced, {$totalErrors} errors across {$targetCount} target(s).");
        return self::SUCCESS;
    }

    /**
     * Build the list of sync targets. Each target is `[org_id, brand_id]`
     * where brand_id may be null (org-level Smoobu key) or set (brand-
     * level key on the `brands` table).
     *
     * Why this matters: pre-fix, the cron only walked
     * `hotel_settings.booking_smoobu_api_key`, so any brand with its
     * OWN `brands.pms_smoobu_api_key` was invisible to the cron and
     * never synced. Multi-brand customers reported "sync only catches
     * part of bookings even after retries" — the missing part was
     * always the brand-scoped half of their portfolio.
     *
     * @return array<int, array{org_id:int, brand_id:?int}>
     */
    private function syncTargets(): array
    {
        if ($explicit = $this->option('org')) {
            return [['org_id' => (int) $explicit, 'brand_id' => null]];
        }

        $targets = [];

        // 1. Orgs with an org-level Smoobu key.
        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', 'booking_smoobu_api_key')
            ->whereNotNull('value')
            ->where('value', '!=', '')
            ->pluck('organization_id')
            ->filter()
            ->unique()
            ->values()
            ->all();
        foreach ($orgIds as $orgId) {
            $targets[] = ['org_id' => (int) $orgId, 'brand_id' => null];
        }

        // 2. Brands with a per-brand Smoobu key. Each gets its own
        //    pass so SmoobuClient picks the brand-scoped credentials.
        try {
            $brands = \App\Models\Brand::withoutGlobalScopes()
                ->whereNotNull('pms_smoobu_api_key')
                ->where('pms_smoobu_api_key', '!=', '')
                ->get(['id', 'organization_id', 'pms_smoobu_api_key']);
            foreach ($brands as $brand) {
                $targets[] = [
                    'org_id'   => (int) $brand->organization_id,
                    'brand_id' => (int) $brand->id,
                ];
            }
        } catch (\Throwable $e) {
            // Defensive — brands table might not exist on a legacy
            // org. Don't let it kill the cron entirely.
            Log::warning('Smoobu cron could not enumerate brands: ' . $e->getMessage());
        }

        return $targets;
    }
}
