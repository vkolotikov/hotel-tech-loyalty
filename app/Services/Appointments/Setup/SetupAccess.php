<?php

namespace App\Services\Appointments\Setup;

use App\Models\ServiceMaster;
use App\Models\Staff;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\Appointments\AppointmentRefused;

/**
 * Who may change what in the workspace's Setup (owner decision 2026-10-01):
 * owners and managers change everything; everyone else may add and remove
 * time off only for the team member linked to their own sign-in. Every
 * setup endpoint asks here first; the screens only mirror the answer.
 */
final class SetupAccess
{
    public const MANAGER_ROLES = ['super_admin', 'manager'];

    /** The caller's role in the bound organisation (Staff is tenant-scoped), never another organisation's; a deactivated row counts for nothing. */
    public static function canManage(User $user): bool
    {
        return in_array(self::activeStaff($user)?->role, self::MANAGER_ROLES, true);
    }

    /** The team member linked to this sign-in in the bound organisation, active or not, whatever brand is selected. */
    public static function ownTeamMemberId(User $user): ?int
    {
        $id = ServiceMaster::withoutGlobalScope(BrandScope::class)->where('user_id', $user->id)->value('id');

        return $id === null ? null : (int) $id;
    }

    public static function requireManager(User $user): void
    {
        if (!self::canManage($user)) {
            throw new AppointmentRefused('not_allowed', 'Only an owner or a manager can change this.', 403);
        }
    }

    public static function requireTimeOffRight(User $user, ServiceMaster $master): void
    {
        if (self::canManage($user) || (self::activeStaff($user) !== null && self::ownTeamMemberId($user) === (int) $master->id)) {
            return;
        }

        throw new AppointmentRefused('not_allowed', 'You can change only your own time off.', 403);
    }

    /** The caller's active staff row in the bound organisation, or null. */
    private static function activeStaff(User $user): ?Staff
    {
        return Staff::where('user_id', $user->id)->where('is_active', true)->first();
    }
}
