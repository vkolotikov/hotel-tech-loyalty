<?php

namespace App\Services\Loyalty;

use App\Models\Staff;
use App\Models\User;
use App\Support\AdminAccess\AccessMap;

/**
 * Who may do what in HexaTech Loyalty (spec 2026-10-21 §5). The rules are the
 * full admin's own wherever it has one: awarding needs `can_award_points`,
 * redeeming and handling redemptions `can_redeem_points`, rewards and offers
 * `can_manage_offers` (the flags `staff.can` checks), the programme's tiers,
 * benefits and boost events a manager. Reversing a ledger line, which the
 * full admin has no screen for, is a manager's correction. Every endpoint
 * asks here; the workspace only mirrors the answers (`forBootstrap`).
 *
 * Staff rows are tenant-scoped, so the row read is this organisation's; a
 * deactivated row counts for nothing. A platform admin passes every flag,
 * as with `staff.can`.
 */
final class LoyaltyAccess
{
    public const AWARD = 'can_award_points';
    public const REDEEM = 'can_redeem_points';
    public const MANAGE_REWARDS = 'can_manage_offers';

    private static function staff(User $user): ?Staff
    {
        return Staff::where('user_id', $user->id)->where('is_active', true)->first();
    }

    public static function isManager(User $user): bool
    {
        return in_array(self::staff($user)?->role, AccessMap::MANAGER_ROLES, true);
    }

    public static function has(User $user, string $flag): bool
    {
        if (method_exists($user, 'isPlatformAdmin') && $user->isPlatformAdmin()) {
            return true;
        }

        return (bool) (self::staff($user)?->{$flag} ?? false);
    }

    public static function requireManager(User $user): void
    {
        if (!self::isManager($user)) {
            throw new LoyaltyRefused('manager_only', 'Only an owner or a manager can do this.', 403);
        }
    }

    public static function require(User $user, string $flag): void
    {
        if (!self::has($user, $flag)) {
            throw new LoyaltyRefused('not_allowed', 'Your account may not do this.', 403, ['need' => $flag]);
        }
    }

    /** @return array{award: bool, redeem: bool, reverse: bool, manage_program: bool, manage_rewards: bool} */
    public static function forBootstrap(User $user): array
    {
        $manager = self::isManager($user);

        return [
            'award'          => self::has($user, self::AWARD),
            'redeem'         => self::has($user, self::REDEEM),
            'reverse'        => $manager,
            'manage_program' => $manager,
            'manage_rewards' => self::has($user, self::MANAGE_REWARDS),
        ];
    }
}
