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
 * - planning someone else's day, or the whole team's, with the AI or the rules (`plan_team`), and its apply;
 * - a person's planner profile (`edit_people`) and their skills, which only the full admin's `PUT team/{id}` writes
 *   (AccessMap `admin/team`: changes a manager's);
 * - the team's backlog buckets (`planner/backlog?scope=team`, refused to staff by PlannerController);
 * - the planner's settings (`manage_settings`): the full admin keeps them on its Settings page, a manager's menu; the
 *   `crm-settings` endpoint itself stays every staff member's (owner 2026-11-08), so this only hides the controls.
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
            'plan_team'        => $manager,
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
