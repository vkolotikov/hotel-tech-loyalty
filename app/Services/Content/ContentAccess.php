<?php

namespace App\Services\Content;

use App\Models\Staff;
use App\Models\User;

/**
 * Who may do what in HexaTech Content (spec 2026-10-14 §5.1): owners and
 * managers set the brand up, write strategies and generate whole calendars;
 * every staff member writes posts and uses AI on one post. Every endpoint
 * asks here; the portal only mirrors the answer.
 */
final class ContentAccess
{
    public const MANAGER_ROLES = ['super_admin', 'manager'];

    /** The caller's role in the bound organisation (Staff is tenant-scoped); a deactivated row counts for nothing. */
    public static function canManage(User $user): bool
    {
        return in_array(Staff::where('user_id', $user->id)->where('is_active', true)->first()?->role, self::MANAGER_ROLES, true);
    }

    public static function requireManager(User $user): void
    {
        if (!self::canManage($user)) {
            throw new ContentRefused('manager_only', 'Only an owner or a manager can do this.', 403);
        }
    }
}
