<?php

namespace App\Console\Commands;

use App\Services\Crm\LeadCorrespondenceSync;
use Illuminate\Console\Command;

class SyncLeadCorrespondence extends Command
{
    protected $signature = 'crm:sync-lead-correspondence';

    protected $description = 'Capture connected lead mail and update email and WhatsApp reply badges';

    public function handle(LeadCorrespondenceSync $sync): int
    {
        $this->info('Contacts checked: '.$sync->run());

        return self::SUCCESS;
    }
}
