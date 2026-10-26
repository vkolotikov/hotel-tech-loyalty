<?php

namespace App\Services\Loyalty\Programme;

use App\Models\AuditLog;
use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\TierBenefit;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\RequestQueue;
use App\Support\AdvisoryLock;

/**
 * Deleting a benefit (release 11, owner 2026-10-26). It leaves the catalogue and every tier (soft-deleted, its tier
 * links switched off as taking one off does), so no member sees or asks for it again. What members already asked for
 * stays: their requests keep its name, and the ones still waiting stay in Requests for staff to approve or decline.
 * `preview()` says so before the confirm; `remove()` does it.
 */
final class BenefitRemoval
{
    /** @return array<string, mixed> */
    public function preview(BenefitDefinition $benefit): array
    {
        return [
            'benefit'  => ['id' => (int) $benefit->id, 'name' => (string) $benefit->name],
            'tiers'    => TierBenefit::query()->where('benefit_id', $benefit->id)->where('is_active', true)
                ->whereHas('tier')->with('tier:id,name')->get()
                ->map(fn (TierBenefit $tb) => (string) $tb->tier?->name)->filter()->unique()->values()->all(),
            'waiting'  => BenefitEntitlement::query()->where('benefit_id', $benefit->id)->whereIn('status', RequestQueue::WAITING)->count(),
            'requests' => BenefitEntitlement::query()->where('benefit_id', $benefit->id)->count(),
        ];
    }

    /** @return array{tiers: int} How many tiers it was taken off. */
    public function remove(BenefitDefinition $benefit, User $by): array
    {
        $orgId = (int) $benefit->organization_id;

        return AdvisoryLock::transaction("benefits:{$orgId}", function () use ($benefit, $by) {
            $locked = BenefitDefinition::query()->whereKey($benefit->id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            $before = $locked->only(['name', 'code', 'category', 'fulfillment_mode', 'is_active']);
            $tiers = TierBenefit::query()->where('benefit_id', $locked->id)->where('is_active', true)->update(['is_active' => false]);
            $locked->delete();

            AuditLog::record('benefit_deleted', $locked, ['tiers_taken_off' => $tiers], $before, $by, "Benefit '{$locked->name}' deleted");

            return ['tiers' => $tiers];
        });
    }
}
