<?php

namespace App\Services\Time;

use App\Models\CrmSetting;
use App\Models\PlannerTask;
use App\Models\User;

/**
 * Who may put work on whose day (owner 2026-11-09: "for some companies all team can add to others, in some companies
 * only each user can plan their day … 2 options which can be configured in settings of planner"). One setting of the
 * organisation, `crm_settings.planner_planning_mode`, written only from the Time Planner's Settings
 * (`PUT admin/time/settings/planner_planning_mode`, a manager's):
 *
 * - `team` (the default, the planner as it always was): anyone may add a task to a colleague's day, assign, move or
 *   finish anyone's work and plan anyone's day, with the AI or the rules;
 * - `own`: a staff member plans only their own day — they add, change, move, clock and finish their own tasks and the
 *   unassigned ones (the pool, the day's work nobody has; taking one is a claim as before), assign only to themselves or
 *   nobody, and plan only their own day. Everyone still sees the team's days.
 *
 * Managers (`super_admin`, `manager`) plan for anyone in both modes: they are the ones who choose the mode.
 *
 * The rule is the server's, in one place: the full admin's own `planner/*` endpoints (PlannerController) and the Time
 * Planner's (`admin/time/*`) ask here, and the workspace's bootstrap only mirrors it (`staff.can.plan_team`) to hide
 * what would be refused. A refusal is `own_day_only` (403) with a sentence the full admin shows as it is.
 */
final class PlanningMode
{
    public const KEY = 'planner_planning_mode';

    public const TEAM = 'team';

    public const OWN = 'own';

    public const MODES = [self::TEAM, self::OWN];

    /** The organisation's mode (the current tenant's row); anything unreadable is the default, `team`. */
    public static function current(): string
    {
        return self::read(CrmSetting::query()->where('key', self::KEY)->value('value'));
    }

    /** A stored value as a mode: `own`, `"own"` (JSON text, as the planner's lists are kept) or the default. */
    public static function read(mixed $value): string
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_string($decoded) ? $decoded : $value;
        }

        return in_array($value, self::MODES, true) ? $value : self::TEAM;
    }

    /** Whether this person may put work on someone else's day: everyone in `team` mode, managers always. */
    public static function mayPlanOthers(User $user): bool
    {
        return self::current() === self::TEAM || TimeAccess::isManager($user);
    }

    /** The task is this person's: their account, or (a row from before accounts) their name and no account. */
    public static function isOwn(User $user, PlannerTask $task): bool
    {
        if ($task->assigned_to_user_id !== null) {
            return (int) $task->assigned_to_user_id === (int) $user->id;
        }

        return self::filled($task->employee_name) && self::sameName($task->employee_name, $user->name);
    }

    /** Nobody has the task yet: no account and no name. */
    public static function isUnassigned(PlannerTask $task): bool
    {
        return $task->assigned_to_user_id === null && !self::filled($task->employee_name);
    }

    /** Whether this person may change, move, clock, finish or delete the task. */
    public static function mayChange(User $user, PlannerTask $task): bool
    {
        return self::mayPlanOthers($user) || self::isOwn($user, $task) || self::isUnassigned($task);
    }

    /**
     * Whether this person may give a task this owner: in `own` mode only themselves or nobody — the account, when one is
     * named, must be theirs, and the name, when one is given, their own.
     */
    public static function mayAssign(User $user, mixed $userId, mixed $name): bool
    {
        if (self::mayPlanOthers($user)) {
            return true;
        }
        $idOk = $userId === null || $userId === '' || (is_numeric($userId) && (int) $userId === (int) $user->id);
        $nameOk = !self::filled($name) || self::sameName($name, $user->name);

        return $idOk && $nameOk;
    }

    public static function assertMayChange(User $user, PlannerTask $task): void
    {
        if (!self::mayChange($user, $task)) {
            throw self::refused();
        }
    }

    public static function assertMayAssign(User $user, mixed $userId, mixed $name): void
    {
        if (!self::mayAssign($user, $userId, $name)) {
            throw self::refused();
        }
    }

    /**
     * A change to an existing task: the task must be one this person may change, and the owner the request gives it
     * (the account, the name, whichever it sends) one they may give.
     *
     * @param  array<string, mixed>  $changes
     */
    public static function assertMayUpdate(User $user, PlannerTask $task, array $changes): void
    {
        self::assertMayChange($user, $task);
        if (array_key_exists('assigned_to_user_id', $changes) || array_key_exists('employee_name', $changes)) {
            self::assertMayAssign($user, $changes['assigned_to_user_id'] ?? null, $changes['employee_name'] ?? null);
        }
    }

    /**
     * A query narrowed to the tasks this person may change in `own` mode: theirs (the account, or their name without
     * one) and nobody's.
     *
     * @template TQuery of \Illuminate\Database\Eloquent\Builder<PlannerTask>
     *
     * @param  TQuery  $query
     * @return TQuery
     */
    public static function onlyChangeable($query, User $user)
    {
        return $query->where(fn ($q) => $q->where('assigned_to_user_id', $user->id)
            ->orWhere(fn ($n) => $n->whereNull('assigned_to_user_id')->where(fn ($e) => $e->whereNull('employee_name')
                ->orWhere('employee_name', '')->orWhere('employee_name', (string) $user->name))));
    }

    public static function refused(): TimeRefused
    {
        return new TimeRefused(
            'own_day_only',
            'In this planner everyone plans only their own day. A manager can plan a colleague\'s work.',
            403,
        );
    }

    /** A name as the planner matches people (Team::ownerKey): trimmed, in any case. */
    private static function sameName(mixed $a, mixed $b): bool
    {
        return mb_strtolower(trim((string) $a)) === mb_strtolower(trim((string) $b));
    }

    private static function filled(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '';
    }
}
