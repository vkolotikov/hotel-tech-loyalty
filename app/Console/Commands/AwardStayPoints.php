<?php

namespace App\Console\Commands;

use App\Models\BookingMirror;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Awards points for members' stays that ended. Nothing in the application
 * marks the moment a stay ends (the PMS sync relabels it some minutes or
 * hours later), so this looks every day for member stays whose departure
 * date has passed and that have not been awarded yet.
 *
 * Safe to run twice: BookingPointsService::awardForStay() is idempotent on
 * the ledger's key and stamps the stay. Looks back 60 days, so a stay
 * missed during an outage is still awarded.
 */
class AwardStayPoints extends Command
{
    /**
     * How many days back to keep looking at an unstamped stay. A stay left
     * unstamped (payment not yet collected) is picked up again on every
     * run until it's either awarded or ages out of this window -- past
     * that, it's not rescanned forever.
     */
    private const LOOKBACK_DAYS = 60;

    protected $signature = 'bookings:award-stay-points
                            {--org= : Limit to a single organization id}
                            {--dry-run : Report what would be awarded without writing}';

    protected $description = 'Award loyalty points for members\' stays that have ended.';

    public function handle(BookingPointsService $points): int
    {
        $org = $this->option('org') ? (int) $this->option('org') : null;
        $dry = (bool) $this->option('dry-run');
        $awarded = 0;
        $seen = 0;

        BookingMirror::withoutGlobalScopes()
            ->whereNotNull('member_id')
            ->whereNull('points_awarded_at')
            // The day boundary is each venue's own; awardForStay() checks it.
            ->whereDate('departure_date', '<=', now()->addDay()->toDateString())
            ->whereDate('departure_date', '>=', now()->subDays(self::LOOKBACK_DAYS)->toDateString())
            ->when($org, fn ($q) => $q->where('organization_id', $org))
            ->orderBy('id')
            ->chunkById(200, function ($stays) use ($points, $dry, &$awarded, &$seen) {
                foreach ($stays as $stay) {
                    $seen++;
                    if ($dry) {
                        // The same rule the real run applies: a cancelled,
                        // unpaid or not-yet-departed stay is not listed.
                        if ($points->stayIsDue($stay)) {
                            $awarded++;
                            $this->line("[dry-run] stay #{$stay->id} (org {$stay->organization_id}, departed {$stay->departure_date?->toDateString()})");
                        }
                        continue;
                    }
                    try {
                        if ($points->awardForStay($stay)) {
                            $awarded++;
                        }
                    } catch (\Throwable $e) {
                        Log::error('bookings:award-stay-points failed for a stay', ['mirror' => $stay->id, 'error' => $e->getMessage()]);
                    }
                }
            });

        $this->info($dry ? "{$awarded} stay(s) would be awarded of {$seen} looked at." : "{$awarded} stay(s) awarded of {$seen} looked at.");

        return self::SUCCESS;
    }
}
