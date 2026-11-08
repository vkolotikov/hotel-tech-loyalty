<?php

namespace App\Services\Time;

use App\Models\Staff;
use App\Models\User;
use App\Support\AdminAccess\AccessMap;

/**
 * Who may do what in HexaTech Time Planner (2026-11-09). The workspace works on the full admin's own planner endpoints
 * (`admin/planner*`, every staff member's, as its menu is everyone's) and its own (`admin/time*`); the few decisions
 * that are a manager's are the full admin's own:
 *
 * - putting work on someone else's day — adding, assigning, moving, and planning a colleague's or the team's day with the
 *   AI or the rules (`plan_team`): everyone's in the organisation's `team` planning mode, a manager's in `own` mode
 *   (PlanningMode, the server's rule for the full admin's planner endpoints too);
 * - a person's planner profile (`edit_people`) and their skills, which only the full admin's `PUT team/{id}` writes
 *   (AccessMap `admin/team`: changes a manager's);
 * - the team's backlog buckets (`planner/backlog?scope=team`, refused to staff by PlannerController);
 * - the planner's settings (`manage_settings`), the workspace's own `PUT admin/time/settings/{key}` (AccessMap: a
 *   manager's change), among them the planning mode.
 *
 * forBootstrap() answers those rules so the workspace can hide what the server would refuse; the server decides.
 */
final class TimeAccess
{
    public static function staff(User $user): ?Staff
    {
        return Staff::where('user_id', $user->id)->where('is_active', true)->first();
    }

    public static function isManager(User $user): bool
    {
        if ($user->isPlatformAdmin()) {
            return true;
        }

        return in_array(self::staff($user)?->role, AccessMap::MANAGER_ROLES, true);
    }

    public static function role(User $user): ?string
    {
        return self::staff($user)?->role;
    }

    /** @return array{plan_team: bool, edit_people: bool, team_buckets: bool, manage_settings: bool, manage_templates: bool} */
    public static function forBootstrap(User $user): array
    {
        $manager = self::isManager($user);

        return [
            'plan_team'        => $manager || PlanningMode::current() === PlanningMode::TEAM,
            'edit_people'      => $manager,
            'team_buckets'     => $manager,
            'manage_settings'  => $manager,
            // planner/templates: every staff member's in the full admin (its Planner page keeps them).
            'manage_templates' => true,
        ];
    }

    public static function assertManager(User $user): void
    {
        if (!self::isManager($user)) {
            throw TimeRefused::managerOnly();
        }
    }
}
