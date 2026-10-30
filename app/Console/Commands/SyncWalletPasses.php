<?php

namespace App\Console\Commands;

use App\Models\WalletPass;
use App\Services\Wallet\SyncPass;
use App\Support\SharedCache;
use Illuminate\Console\Command;

class SyncWalletPasses extends Command
{
    protected $signature = 'loyalty:sync-wallets';
    protected $description = 'Refresh issued wallet passes and retry provider updates (no new member passes).';

    public function handle(SyncPass $sync): int
    {
        // A final pass may have 30 devices, each with a ten-second provider timeout.
        // Keep the lease beyond that work plus the sixty-second selection window.
        $lock = SharedCache::store()->lock('wallet:sync', 600);
        if (!$lock->get()) return self::SUCCESS;
        try {
            $deadline = microtime(true) + 60;
            $rows = WalletPass::where(fn ($q) => $q->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
                ->orderByRaw('CASE WHEN next_attempt_at IS NULL THEN 0 ELSE 1 END')->orderBy('next_attempt_at')->orderBy('id')->limit(200)->get();
            $count = 0;
            foreach ($rows as $pass) {
                if (microtime(true) >= $deadline) break;
                $sync->run($pass);
                $count++;
            }
            $this->info("Checked {$count} wallet passes. Provider failures appear in Operations status.");
            return self::SUCCESS;
        } finally {
            $lock->release();
        }
    }
}
