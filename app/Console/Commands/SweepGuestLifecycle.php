<?php

namespace App\Console\Commands;

use App\Services\GuestLifecycleService;
use Illuminate\Console\Command;

class SweepGuestLifecycle extends Command
{
    protected $signature = 'guests:sweep-lifecycle {--reassess-all : Also recompute lifecycle_status for every guest from current totals (one-shot backfill)}';

    protected $description = 'Mark guests with no activity in the last 90 days as Inactive';

    public function handle(GuestLifecycleService $lifecycle): int
    {
        if ($this->option('reassess-all')) {
            $changed = $lifecycle->reassessAll();
            $this->info("Reassessed lifecycle for all guests; {$changed} updated.");
        }

        $count = $lifecycle->sweepDormant();
        $this->info("Marked {$count} guest(s) as Inactive.");
        return self::SUCCESS;
    }
}
