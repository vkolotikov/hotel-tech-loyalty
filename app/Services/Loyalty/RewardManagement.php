<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Support\AdvisoryLock;
use Illuminate\Support\Facades\DB;

/** Catalogue controls shared by both admin interfaces. Never cascade away redemption history. */
final class RewardManagement
{
    public function state(Reward $reward, ?bool $active, User $by): Reward
    {
        LoyaltyAccess::require($by, LoyaltyAccess::MANAGE_REWARDS);

        return DB::transaction(function () use ($reward, $active, $by) {
            $locked = Reward::query()->whereKey($reward->id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            $old = (bool) $locked->is_active;
            $next = $active ?? !$old;
            if ($old !== $next) {
                $locked->update(['is_active' => $next]);
                AuditLog::record('reward_toggled', $locked, ['is_active' => $next], ['is_active' => $old], $by,
                    "Reward '{$locked->name}' " . ($next ? 'activated' : 'deactivated'));
            }

            return $locked;
        });
    }

    public function delete(Reward $reward, User $by): void
    {
        LoyaltyAccess::require($by, LoyaltyAccess::MANAGE_REWARDS);
        $orgId = (int) $reward->organization_id;
        // Same organisation lock as option saves: a stamp reward cannot be selected while it is removed.
        AdvisoryLock::transaction("loyalty-setup:{$orgId}", function () use ($reward, $orgId, $by) {
            // Both member redemption paths take this row first, before recording a redemption.
            $locked = Reward::query()->whereKey($reward->id)->lockForUpdate()->first() ?? throw LoyaltyRefused::notFound();
            if (RewardRedemption::withoutGlobalScopes()->where('reward_id', $locked->id)->exists()
                || (int) ProgrammeOptions::get($orgId, 'stamp_reward_id') === (int) $locked->id) {
                throw new LoyaltyRefused('reward_in_use', 'This reward has redemption history or is selected for a stamp card. Disable it instead.', 422);
            }
            $name = (string) $locked->name;
            $id = (int) $locked->id;
            $locked->delete();
            AuditLog::record('reward_deleted', null, ['reward_id' => $id, 'name' => $name], [], $by, "Reward '{$name}' deleted");
        });
    }
}
