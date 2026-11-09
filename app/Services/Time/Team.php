<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use App\Models\Staff;
use App\Support\AdminAccess\AccessMap;

/**
 * The people the planner plans for (HexaTech Time Planner, 2026-11-09), as the full admin's Planner lists them: every
 * active staff member with an account, then the extra names its settings add (`employees`, people without an account,
 * such as an outside cleaner). Each person has a `key` — `u<user id>` or `n:<name>` — and their planner profile.
 *
 * A task is a person's when it names their account (`assigned_to_user_id`), or, with no account named, their name
 * (`employee_name`, the full admin's older and still common way); a task naming neither is nobody's (unassigned).
 */
final class Team
{
    /** @var list<array<string, mixed>>|null */
    private ?array $people = null;

    public function __construct(private readonly PlannerCatalogue $catalogue)
    {
    }

    /**
     * @return list<array{key: string, user_id: ?int, staff_id: ?int, name: string, role: ?string, department: ?string, manager: bool,
     *   avatar_url: ?string, has_account: bool, profile: array<string, mixed>, prefers: array{groups: list<string>, tasks: list<string>}}>
     */
    public function people(): array
    {
        if ($this->people !== null) {
            return $this->people;
        }

        $prefs = $this->catalogue->employeePrefs();
        $out = [];
        $names = [];
        $staff = Staff::query()->with('user:id,name,email,avatar_url')
            ->where('is_active', true)->whereNotNull('user_id')->get();
        foreach ($staff as $s) {
            $name = trim((string) ($s->user->name ?? ''));
            if ($name === '') {
                continue;
            }
            $names[mb_strtolower($name)] = true;
            $out[] = [
                'key'         => 'u' . $s->user_id,
                'user_id'     => (int) $s->user_id,
                'staff_id'    => (int) $s->id,
                'name'        => $name,
                'role'        => $s->role,
                'department'  => $s->department,
                'manager'     => in_array($s->role, AccessMap::MANAGER_ROLES, true),
                'avatar_url'  => $s->user?->avatar_url,
                'has_account' => true,
                'profile'     => PlannerProfiles::of($s),
                'prefers'     => $prefs[$name] ?? ['groups' => [], 'tasks' => []],
            ];
        }
        foreach ($this->catalogue->extraEmployees() as $name) {
            if (isset($names[mb_strtolower($name)])) {
                continue;
            }
            $names[mb_strtolower($name)] = true;
            $out[] = [
                'key'         => 'n:' . $name,
                'user_id'     => null,
                'staff_id'    => null,
                'name'        => $name,
                'role'        => null,
                'department'  => null,
                'manager'     => false,
                'avatar_url'  => null,
                'has_account' => false,
                'profile'     => ['skills' => null, 'knowledge' => '', 'work_start' => null, 'work_end' => null, 'work_days' => null, 'break_minutes' => 0],
                'prefers'     => $prefs[$name] ?? ['groups' => [], 'tasks' => []],
            ];
        }
        usort($out, fn (array $a, array $b) => strcasecmp($a['name'], $b['name']));

        return $this->people = $out;
    }

    /** @return array<string, mixed>|null */
    public function find(string $key): ?array
    {
        foreach ($this->people() as $p) {
            if ($p['key'] === $key) {
                return $p;
            }
        }

        return null;
    }

    /** @return array<string, mixed>|null */
    public function byUser(?int $userId): ?array
    {
        return $userId ? $this->find('u' . $userId) : null;
    }

    /**
     * The key of the person a task belongs to, or null when it is nobody's. A name no listed person has still gets its
     * own key, so the task keeps a lane of its own instead of looking unassigned.
     */
    public function ownerKey(PlannerTask $task): ?string
    {
        if ($task->assigned_to_user_id) {
            return 'u' . (int) $task->assigned_to_user_id;
        }
        $name = trim((string) $task->employee_name);
        if ($name === '') {
            return null;
        }
        foreach ($this->people() as $p) {
            if (mb_strtolower($p['name']) === mb_strtolower($name)) {
                return $p['key'];
            }
        }

        return 'n:' . $name;
    }

    /** Whether a person may take a task of this type from the pool (their skills; NULL skills = any type; managers any). */
    public static function mayTake(array $person, ?string $group): bool
    {
        if ($group === null || $group === '' || $person['manager']) {
            return true;
        }
        // A team person carries them in its profile, a day board's lane at its top level.
        $skills = array_key_exists('skills', $person) ? $person['skills'] : ($person['profile']['skills'] ?? null);

        return !is_array($skills) || in_array($group, $skills, true);
    }

    /** The account and name a task assigned to this person carries (both, as the full admin's claim writes them). */
    public static function assignment(array $person): array
    {
        return ['assigned_to_user_id' => $person['user_id'], 'employee_name' => $person['name']];
    }
}
