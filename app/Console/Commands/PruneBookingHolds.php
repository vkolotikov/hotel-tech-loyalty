<?php

namespace App\Console\Commands;

use App\Models\BookingHold;
use App\Models\BookingIdempotencyKey;
use Illuminate\Console\Command;

/**
 * Prune expired BookingHold + BookingIdempotencyKey rows.
 *
 * Rationale (audit 2026-06-01):
 * - BookingHold is a quote/cart row written on every quote() call. Holds
 *   that aren't confirmed accumulate indefinitely with their full
 *   payload_json blob (~2KB each, contains guest PII — GDPR retention concern).
 * - BookingIdempotencyKey has expires_at=+24h and grows by every distinct
 *   idempotency key seen.
 *
 * This command deletes holds expired more than --days days ago (default 7)
 * and idempotency keys expired more than --idemp-days ago (default 7).
 *
 * Scheduled daily in routes/console.php at 03:45.
 */
class PruneBookingHolds extends Command
{
    protected $signature = 'bookings:prune-holds
        {--days=7 : Delete BookingHold rows whose expires_at is older than this many days}
        {--idemp-days=7 : Delete BookingIdempotencyKey rows whose expires_at is older than this many days}
        {--limit=10000 : Maximum rows to delete per table per run (chunked to avoid long transactions)}
        {--dry-run : Report counts without deleting}';

    protected $description = 'Prune expired booking_holds + booking_idempotency_keys rows (PII retention + bloat control)';

    public function handle(): int
    {
        $days = (int) $this->option('days');
        $idempDays = (int) $this->option('idemp-days');
        $limit = (int) $this->option('limit');
        $dryRun = (bool) $this->option('dry-run');

        $holdCutoff = now()->subDays($days);
        $idempCutoff = now()->subDays($idempDays);

        $holdQuery = BookingHold::query()
            ->withoutGlobalScopes()
            ->where('expires_at', '<', $holdCutoff);

        $idempQuery = BookingIdempotencyKey::query()
            ->withoutGlobalScopes()
            ->where('expires_at', '<', $idempCutoff);

        $holdCount = (clone $holdQuery)->count();
        $idempCount = (clone $idempQuery)->count();

        $this->line("BookingHold rows to prune (expires_at < {$holdCutoff->toDateTimeString()}): {$holdCount}");
        $this->line("BookingIdempotencyKey rows to prune (expires_at < {$idempCutoff->toDateTimeString()}): {$idempCount}");

        if ($dryRun) {
            $this->info('Dry run — no deletions.');
            return self::SUCCESS;
        }

        $holdDeleted = 0;
        // Chunked delete to avoid a single huge transaction
        while (true) {
            $ids = (clone $holdQuery)->limit($limit)->pluck('id');
            if ($ids->isEmpty()) break;
            $holdDeleted += BookingHold::withoutGlobalScopes()->whereIn('id', $ids)->delete();
            if ($ids->count() < $limit) break;
        }

        $idempDeleted = 0;
        while (true) {
            $ids = (clone $idempQuery)->limit($limit)->pluck('id');
            if ($ids->isEmpty()) break;
            $idempDeleted += BookingIdempotencyKey::withoutGlobalScopes()->whereIn('id', $ids)->delete();
            if ($ids->count() < $limit) break;
        }

        $this->info("Deleted {$holdDeleted} BookingHold rows + {$idempDeleted} BookingIdempotencyKey rows.");

        return self::SUCCESS;
    }
}
