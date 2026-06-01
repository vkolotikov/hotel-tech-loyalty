<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ReleasesScheduleLock;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Services\IntegrationStatus;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Push local-only bookings to Smoobu after the original confirm() POST failed.
 *
 * When a guest pays via Stripe and the synchronous Smoobu POST fails
 * (auth, 5xx, timeout), BookingEngineService falls back to creating a
 * local-only mirror with `internal_status='pending_pms_sync'`. The guest
 * sees their booking confirmed; the PMS doesn't know yet. This command
 * resolves that gap.
 *
 * Strategy:
 *   - Scan booking_mirrors WHERE internal_status='pending_pms_sync'
 *     AND pms_sync_attempts < 5
 *   - For each, attempt createReservation. On success → flip internal_status
 *     to 'confirmed' and stamp synced_at + Smoobu reservation_id.
 *   - On failure → increment pms_sync_attempts, store last error.
 *   - At 5 failed attempts → flip internal_status to 'pms_sync_failed' so
 *     it surfaces in the admin dashboard and stops auto-retrying.
 *
 * Audit-logged on success + permanent failure so staff can see what
 * happened from the audit-log page.
 */
class RetryPmsSync extends Command
{
    use ReleasesScheduleLock;

    protected const MAX_ATTEMPTS = 5;

    protected $signature = 'bookings:retry-pms-sync
                            {--org= : Limit to a single organization id}
                            {--force : Ignore the attempts cap and retry pms_sync_failed rows too}';

    protected $description = 'Push local-only bookings (pending_pms_sync) to Smoobu and finalize their PMS state';

    public function handle(SmoobuClient $smoobu): int
    {
        // Register expired-lock cleanup before any work — protects against
        // SIGTERM/OOM mid-run leaving a zombie framework-schedule lock that
        // blocks future ticks. Same pattern shipped on SyncSmoobuBookings.
        $this->releaseScheduleLockOnShutdown();

        if (!IntegrationStatus::isEnabled('smoobu')) {
            $this->info('Smoobu integration is globally disabled — skipping.');
            return self::SUCCESS;
        }

        $orgFilter = $this->option('org') ? (int) $this->option('org') : null;
        $force     = (bool) $this->option('force');

        $query = BookingMirror::withoutGlobalScopes()
            ->whereIn('internal_status', $force ? ['pending_pms_sync', 'pms_sync_failed'] : ['pending_pms_sync'])
            ->when(!$force, fn($q) => $q->where('pms_sync_attempts', '<', self::MAX_ATTEMPTS))
            ->when($orgFilter, fn($q) => $q->where('organization_id', $orgFilter))
            ->orderBy('id'); // oldest first — fair queue

        $count = (clone $query)->count();
        if ($count === 0) {
            $this->info('No bookings waiting for PMS sync.');
            return self::SUCCESS;
        }

        $this->info("Found {$count} booking(s) pending PMS sync" . ($force ? ' (including failed retries)' : ''));

        $successCount = 0;
        $failCount    = 0;
        $finalFailCount = 0;

        $query->chunk(50, function ($mirrors) use ($smoobu, &$successCount, &$failCount, &$finalFailCount) {
            foreach ($mirrors as $mirror) {
                // Bind tenant context so SmoobuClient picks up the right key.
                app()->instance('current_organization_id', (int) $mirror->organization_id);
                app()->forgetInstance('current_brand_id');

                try {
                    // priceStatus (docs-compliant) + price-paid (legacy
                    // kebab) ship additively — same pattern as the
                    // confirm() path. The mirror was created in
                    // pending_pms_sync state, so price_paid is what was
                    // actually captured by Stripe at booking time.
                    $pricePaid = (float) ($mirror->price_paid ?? 0);
                    // Use resolveDirectChannelId (non-strict on cron — we
                    // don't want to blow up a retry over a channel config
                    // issue) and only inject channelId when > 0, matching
                    // single-room confirm()'s pattern. Sending an explicit
                    // 0 lands the booking in Smoobu's Blocked Channel.
                    $payload = [
                        'apartmentId'   => (int) $mirror->apartment_id,
                        'arrivalDate'   => $mirror->arrival_date instanceof \DateTimeInterface
                                            ? $mirror->arrival_date->format('Y-m-d')
                                            : (string) $mirror->arrival_date,
                        'departureDate' => $mirror->departure_date instanceof \DateTimeInterface
                                            ? $mirror->departure_date->format('Y-m-d')
                                            : (string) $mirror->departure_date,
                        'firstName'     => $this->firstName($mirror->guest_name),
                        'lastName'      => $this->lastName($mirror->guest_name),
                        'email'         => $mirror->guest_email ?? '',
                        'phone'         => $mirror->guest_phone ?? '',
                        'adults'        => (int) ($mirror->adults ?? 1),
                        'children'      => (int) ($mirror->children ?? 0),
                        'price'         => (float) ($mirror->price_total ?? 0),
                        'price-paid'    => $pricePaid,
                        'priceStatus'   => $pricePaid > 0 ? 1 : 0,
                        'language'      => 'en',
                        // 'type' avoids Smoobu's blocked-channel default
                        // — single-room confirm() ships this for the same
                        // reason. See audit 2026-06-01 finding RetryPmsSync.
                        'type'          => 'reservation',
                    ];
                    $channelId = (int) ($smoobu->resolveDirectChannelId(false) ?: 0);
                    if ($channelId > 0) {
                        $payload['channelId'] = $channelId;
                    }
                    $result = $smoobu->createReservation($payload);

                    // Smoobu accepted — write back the real reservation_id
                    // (the placeholder LOCAL-* id stays as a redirect via
                    // booking_reference, but reservation_id becomes canonical).
                    $mirror->update([
                        'reservation_id'           => (string) ($result['id'] ?? $mirror->reservation_id),
                        'booking_reference'        => $result['reference-id'] ?? $mirror->booking_reference,
                        'internal_status'          => 'confirmed',
                        'synced_at'                => now(),
                        'pms_sync_attempts'        => $mirror->pms_sync_attempts + 1,
                        'pms_sync_last_attempt_at' => now(),
                        'pms_sync_last_error'      => null,
                    ]);
                    $successCount++;

                    AuditLog::create([
                        'organization_id' => $mirror->organization_id,
                        'action'          => 'booking.pms.sync_recovered',
                        'subject_type'    => 'booking_mirror',
                        'subject_id'      => $mirror->id,
                        'description'     => "Recovered PMS sync for booking #{$mirror->id} after {$mirror->pms_sync_attempts} retry attempt(s)",
                    ]);
                } catch (\Throwable $e) {
                    $attempts = $mirror->pms_sync_attempts + 1;
                    $reachedCap = $attempts >= self::MAX_ATTEMPTS;

                    $mirror->update([
                        'pms_sync_attempts'        => $attempts,
                        'pms_sync_last_attempt_at' => now(),
                        'pms_sync_last_error'      => mb_substr($e->getMessage(), 0, 500),
                        'internal_status'          => $reachedCap ? 'pms_sync_failed' : 'pending_pms_sync',
                    ]);

                    Log::warning('PMS retry attempt failed', [
                        'mirror_id' => $mirror->id,
                        'org_id'    => $mirror->organization_id,
                        'attempts'  => $attempts,
                        'error'     => $e->getMessage(),
                    ]);

                    if ($reachedCap) {
                        $finalFailCount++;
                        AuditLog::create([
                            'organization_id' => $mirror->organization_id,
                            'action'          => 'booking.pms.sync_failed',
                            'subject_type'    => 'booking_mirror',
                            'subject_id'      => $mirror->id,
                            'description'     => "Booking #{$mirror->id} failed PMS sync after {$attempts} attempts. Manual intervention required.",
                        ]);
                    } else {
                        $failCount++;
                    }
                }
            }
        });

        $this->info("Retry sweep complete: {$successCount} recovered · {$failCount} will retry · {$finalFailCount} flagged for manual review");

        return self::SUCCESS;
    }

    private function firstName(?string $full): string
    {
        $parts = preg_split('/\s+/', trim((string) $full));
        return $parts[0] ?? '';
    }

    private function lastName(?string $full): string
    {
        $parts = preg_split('/\s+/', trim((string) $full));
        return count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : '';
    }
}
