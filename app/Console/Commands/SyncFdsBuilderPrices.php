<?php

namespace App\Console\Commands;

use App\Services\Integrations\FdsBuilderCatalog;
use App\Services\Integrations\FdsBuilderKnowledge;
use Illuminate\Console\Command;

final class SyncFdsBuilderPrices extends Command
{
    protected $signature = 'crm:sync-fds-builder-prices';
    protected $description = 'Refresh the FDS Cards brand knowledge from its public retail builders';

    public function handle(FdsBuilderKnowledge $knowledge, FdsBuilderCatalog $catalog): int
    {
        $result = $knowledge->sync($catalog);
        $this->info($result === null ? 'FDS Cards brand absent. Skipped.' : sprintf(
            'FDS builder prices: %d entries, %d changed, %d retired.', $result['entries'], $result['changed'], $result['retired'],
        ));

        return self::SUCCESS;
    }
}
