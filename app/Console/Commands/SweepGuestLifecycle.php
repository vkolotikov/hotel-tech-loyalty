<?php

namespace App\Console\Commands;

use App\Services\GuestLifecycleService;
use Illuminate\Console\Command;

class SweepGuestLifecycle extends Command
{
    protected $signature = 'guests:sweep-lifecycle';

    protected $description = 'Mark guests with no activity in the last 90 days as Inactive';

    public function handle(GuestLifecycleService $lifecycle): int
    {
        $count = $lifecycle->sweepDormant();
        $this->info("Marked {$count} guest(s) as Inactive.");
        return self::SUCCESS;
    }
}
