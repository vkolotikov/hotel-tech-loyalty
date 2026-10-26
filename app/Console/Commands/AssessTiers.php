<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Services\LoyaltyService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The nightly tier check (release 9, owner 2026-10-26). Tiers move when something happens to a member — points, a visit,
 * a refund — and also when time alone decides: a grace period that has run out (`tier_effective_until`), a manager's
 * "keep until" that has ended (`tier_override_until`, in the last three days, so a missed night is caught up), or a
 * windowed programme whose window has moved on (every active member with a tier). This re-assesses those members through
 * LoyaltyService::assessTier() — its own rules for the direction, the lock, grace, "keep until" and soft landing, logged
 * and told as any other move — each under the member row's lock in its own transaction, under its organisation's binding.
 * A member whose tier still stands is not touched, so a second run the same night moves nobody twice.
 */
class AssessTiers extends Command
{
    protected $signature = 'loyalty:assess-tiers {--org= : Only this organisation id}';

    protected $description = 'Re-assess HexaTech Loyalty tiers whose grace period or "keep until" has ended, and every tier on a windowed programme.';

    /** How far back an ended "keep until" is still picked up (a night the scheduler missed). */
    public const OVERRIDE_DAYS = 3;

    public function handle(LoyaltyService $loyalty): int
    {
        $orgs = LoyaltyMember::withoutGlobalScopes()->whereNotNull('tier_id')
            ->when($this->option('org'), fn ($q, $org) => $q->where('organization_id', (int) $org))
            ->distinct()->orderBy('organization_id')->pluck('organization_id');

        $moved = 0;
        $checked = 0;
        foreach ($orgs as $orgId) {
            $orgId = (int) $orgId;
            try {
                [$c, $m] = $this->underOrganization($orgId, fn () => $this->assessOrganization($orgId, $loyalty));
            } catch (\Throwable $e) {
                Log::error('loyalty.assess_tiers_failed', ['org' => $orgId, 'error' => $e->getMessage()]);
                $this->error("organisation {$orgId}: failed");
                continue;
            }
            if ($m > 0) {
                $this->line("organisation {$orgId}: {$m} moved of {$c} checked");
            }
            $checked += $c;
            $moved += $m;
        }
        if ($moved > 0) {
            Log::info('loyalty tiers assessed', ['checked' => $checked, 'moved' => $moved]);
        }
        $this->info("{$moved} moved of {$checked} checked");

        return self::SUCCESS;
    }

    /** @return array{0: int, 1: int} members checked, members moved */
    private function assessOrganization(int $orgId, LoyaltyService $loyalty): array
    {
        $windowed = $loyalty->qualificationBasis() === LoyaltyService::BASIS_WINDOWED;
        $query = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->where('is_active', true)->whereNotNull('tier_id')
            ->when(!$windowed, fn ($q) => $q->where(fn ($w) => $w
                ->where('tier_effective_until', '<=', now()->toDateString())
                ->orWhereBetween('tier_override_until', [now()->subDays(self::OVERRIDE_DAYS), now()])));

        $checked = 0;
        $moved = 0;
        $query->orderBy('id')->select('id')->chunkById(200, function ($rows) use ($orgId, $loyalty, &$checked, &$moved) {
            foreach ($rows as $row) {
                $checked++;
                $didMove = DB::transaction(function () use ($row, $orgId, $loyalty) {
                    $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($row->id)->lockForUpdate()->first();
                    if ($locked === null || !$locked->is_active) {
                        return false;
                    }

                    return $loyalty->assessTier($locked, null, 'scheduled');
                });
                $moved += $didMove ? 1 : 0;
            }
        });

        return [$checked, $moved];
    }

    /** Run under the organisation's tenant binding, and put back whatever was bound before. */
    private function underOrganization(int $orgId, \Closure $work): array
    {
        $had = app()->bound('current_organization_id');
        $previous = $had ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            return $work();
        } finally {
            $had ? app()->instance('current_organization_id', $previous) : app()->forgetInstance('current_organization_id');
        }
    }
}
