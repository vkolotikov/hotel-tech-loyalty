<?php

namespace App\Console\Commands;

use App\Services\Loyalty\Push\ExpoReceipts;
use Illuminate\Console\Command;

/**
 * Reads Expo's receipts for HexaTech Loyalty's push messages (release 4 §5): for every push Expo accepted more than 15
 * minutes ago (and less than a day: Expo keeps receipts about that long) whose receipt was not read yet, asks Expo
 * whether Apple or Google took it. A refused one is marked failed with Expo's reason; a device that is gone
 * (`DeviceNotRegistered`) is cleared from its member, while it is still the device the push went to. Every 15 minutes
 * (routes/console.php). The work is Push\ExpoReceipts'.
 */
class ReadPushReceipts extends Command
{
    protected $signature = 'loyalty:push-receipts {--limit=5000 : At most this many pushes in one run}';

    protected $description = 'Read Expo receipts for HexaTech Loyalty push messages; mark refused pushes failed and clear devices that are gone.';

    public function handle(ExpoReceipts $receipts): int
    {
        $done = $receipts->check(max(1, (int) $this->option('limit')));
        $this->line("Asked about {$done['asked']}; delivered {$done['ok']}, refused {$done['failed']}, devices cleared {$done['cleared']}, not ready yet {$done['waiting']}.");

        return self::SUCCESS;
    }
}
