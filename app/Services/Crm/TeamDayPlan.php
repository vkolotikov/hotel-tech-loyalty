<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\PlannerTask;
use App\Models\Staff;
use App\Models\Task;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Time\PlanningMode;
use App\Services\Time\TaskView;
use App\Services\Time\Team;
use Carbon\CarbonImmutable;

/** A shared team view of dated assignments, using the existing planner and CRM task records. */
final class TeamDayPlan
{
    public function __construct(private Team $team) {}

    public function for(Organization $org, User $user, ?string $date): array
    {
        $now = CarbonImmutable::now(VenueClock::zone((int) $org->id));
        $day = $date ? CarbonImmutable::parse($date, $now->timezone)->startOfDay() : $now->startOfDay();
        $planner = CrmAccess::seesTimePlan($org, $user);
        $people = [];
        if ($planner) {
            $teamEdit = PlanningMode::mayPlanOthers($user);
            foreach ($this->team->people() as $person) {
                $mayAssign = $teamEdit || PlanningMode::mayAssign($user, $person['user_id'], $person['name']);
                $people[$person['key']] = $this->lane($person['key'], $person['name'], $person['user_id'], $mayAssign);
            }
            foreach (PlannerTask::where('organization_id', $org->id)->whereDate('task_date', $day->toDateString())->orderBy('id')->get() as $task) {
                $key = $this->team->ownerKey($task) ?? 'unassigned';
                $status = TaskView::isDone($task) ? 'done' : ($task->status ?: ($task->started_at ? 'in_progress' : 'todo'));
                $people[$key] ??= $this->lane($key, $task->employee_name, $task->assigned_to_user_id, false);
                $people[$key]['tasks'][] = [
                    'id' => (int) $task->id, 'source' => 'planner', 'title' => $task->title,
                    'time' => TaskView::clock($task->start_time), 'priority' => TaskView::priorityRank($task->priority),
                    'status' => in_array($status, ['done','in_progress','blocked'], true) ? $status : 'todo',
                    'editable' => $teamEdit || PlanningMode::isOwn($user, $task) || PlanningMode::isUnassigned($task),
                ];
            }
        } else {
            foreach (Staff::with('user:id,name')->where('organization_id', $org->id)->where('is_active', true)->whereNotNull('user_id')->get() as $staff) {
                if ($staff->user) $people['u'.$staff->user_id] = $this->lane('u'.$staff->user_id, $staff->user->name, $staff->user_id, true);
            }
        }

        $access = CrmBrands::for($user);
        $selected = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        $brands = $selected ? [(int) $selected] : array_column($access['brands'], 'id');
        $tasks = Task::where('organization_id', $org->id)->with('assignee:id,name,organization_id')
            ->where('due_at', '>=', $day->utc())->where('due_at', '<', $day->addDay()->utc());
        if ($selected || !$access['all']) {
            // Older CRM tasks carry their brand on the linked lead. Standalone unbranded work is organisation-wide.
            $tasks->where(function ($q) use ($org, $brands, $access) {
                $q->whereIntegerInRaw('brand_id', $brands)->orWhere(function ($legacy) use ($org, $brands, $access) {
                    $legacy->whereNull('brand_id')->where(function ($links) use ($org, $brands, $access) {
                        $links->whereIn('inquiry_id', Inquiry::where('organization_id', $org->id)->whereIntegerInRaw('brand_id', $brands)->select('id'));
                        if ($access['all']) $links->orWhere(fn ($shared) => $shared->whereNull('inquiry_id')->whereNull('guest_id')->whereNull('corporate_account_id'));
                    });
                });
            });
        }
        foreach ($tasks->orderBy('id')->get() as $task) {
            $assignee = $task->assignee;
            $owner = $assignee instanceof User && (int) $assignee->organization_id === (int) $org->id ? $assignee : null;
            $key = $owner ? 'u'.$owner->id : 'unassigned';
            $people[$key] ??= $this->lane($key, $owner?->name, $owner?->id, false);
            $time = $task->due_at?->copy()->setTimezone($now->timezone)->format('H:i');
            $people[$key]['tasks'][] = [
                'id' => (int) $task->id, 'source' => 'crm', 'title' => $task->title, 'time' => $time === '00:00' ? null : $time,
                'priority' => TaskView::priorityRank($task->priority), 'status' => $task->completed_at ? 'done' : 'todo', 'editable' => true,
            ];
        }

        $all = [];
        $done = $total = 0;
        foreach ($people as &$person) {
            usort($person['tasks'], self::compare(...));
            $person['done'] = count(array_filter($person['tasks'], fn ($t) => $t['status'] === 'done'));
            $total += count($person['tasks']);
            $done += $person['done'];
            foreach ($person['tasks'] as $task) {
                if ($task['status'] !== 'done') $all[] = $task + ['owner' => $person['name'], 'owner_key' => $person['key']];
            }
        }
        unset($person);
        // The team's short list surfaces blockers and high-priority work. Each person's row starts with work underway.
        usort($all, fn ($a, $b) => (($b['status'] === 'blocked') <=> ($a['status'] === 'blocked'))
            ?: ($a['priority'] <=> $b['priority']) ?: self::compare($a, $b));
        usort($people, fn ($a, $b) => (empty($a['tasks']) <=> empty($b['tasks']))
            ?: strcasecmp((string) $a['name'], (string) $b['name']) ?: strcmp($a['key'], $b['key']));

        return ['date' => $day->toDateString(), 'today' => $now->toDateString(), 'as_of' => $now->utc()->toISOString(),
            'planner' => $planner, 'people' => $people, 'total' => $total, 'done' => $done, 'top_tasks' => array_slice($all, 0, 3)];
    }

    private function lane(string $key, ?string $name, ?int $userId, bool $assignable): array
    {
        return ['key' => $key, 'name' => $name, 'user_id' => $userId, 'assignable' => $assignable, 'tasks' => []];
    }

    /** Keep blocked work and work in progress visible, then priority and scheduled time. */
    private static function compare(array $a, array $b): int
    {
        $order = ['in_progress' => 0, 'blocked' => 1, 'todo' => 2, 'done' => 3];
        return [$order[$a['status']], $a['priority'], $a['time'] ?? '24:00', $a['source'], $a['id']]
            <=> [$order[$b['status']], $b['priority'], $b['time'] ?? '24:00', $b['source'], $b['id']];
    }
}
