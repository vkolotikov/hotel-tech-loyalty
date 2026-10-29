<?php

namespace App\Console\Commands;

use App\Services\Loyalty\Visits\VisitEffects;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RetryVisitEffects extends Command
{
    protected $signature = 'loyalty:retry-visit-effects {--org= : Only this organisation}';
    protected $description = 'Retry incomplete visit benefits and reversals through their idempotent writers';

    public function handle(VisitEffects $effects): int
    {
        $completed = 0;
        $failed = 0;
        DB::table(VisitEffects::TABLE)->where('pending', true)
            ->when($this->option('org'), fn ($q, $org) => $q->where('organization_id', (int) $org))
            ->orderBy('id')->chunkById(100, function ($rows) use ($effects, &$completed, &$failed) {
                foreach ($rows as $row) {
                    try {
                        $outcome = $effects->run((int) $row->id);
                        $outcome->failed === [] ? $completed++ : $failed++;
                    } catch (\Throwable $e) {
                        $failed++;
                        Log::error('loyalty.visit_recovery_failed', ['intent_id' => $row->id, 'error' => $e->getMessage()]);
                    }
                }
            });
        $this->info("{$completed} recovered; {$failed} still pending");
        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
