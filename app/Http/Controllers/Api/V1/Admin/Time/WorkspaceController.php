<?php

namespace App\Http\Controllers\Api\V1\Admin\Time;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlannerDayNote;
use App\Models\PlannerTask;
use App\Services\Appointments\VenueClock;
use App\Services\Time\DayBoard;
use App\Services\Time\Experience;
use App\Services\Time\PlannerAi;
use App\Services\Time\PlannerCatalogue;
use App\Services\Time\PlannerProfiles;
use App\Services\Time\TaskClock;
use App\Services\Time\TaskView;
use App\Services\Time\Team;
use App\Services\Time\TimeAccess;
use App\Services\Time\TimeInsights;
use App\Services\Time\WorkWindow;
use App\Support\OrgAccent;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech Time Planner's own endpoints (2026-11-09), under `admin/time/*` behind `workspace:time`; every one but the
 * bootstrap also behind the full admin Planner's own plan gate (`feature:time_management`). Reads, except a person's
 * planner profile (a manager's) and a task's clock (everyone's, as ticking a task done is). Everything else the
 * workspace shows and changes is the full admin's own `planner/*` endpoints, under their own rules.
 */
class WorkspaceController extends Controller
{
    public const NAME = 'HexaTech Time Planner';

    public function bootstrap(Request $request, PlannerAi $ai, PlannerCatalogue $catalogue, Team $team): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $platform = $user->isPlatformAdmin();
        $entitled = $platform || $org->hasFeature('time_management');
        $budget = app(\App\Services\AiUsageService::class)->budgetStatus($org);
        $window = WorkWindow::resolve();
        $today = VenueClock::today($orgId);
        $me = 'u' . $user->id;

        $counts = ['today_open' => 0, 'overdue' => 0, 'pool' => 0];
        if ($entitled) {
            $mine = fn ($q) => $q->where(fn ($w) => $w->where('assigned_to_user_id', $user->id)
                ->orWhere(fn ($n) => $n->whereNull('assigned_to_user_id')->where('employee_name', (string) $user->name)));
            $open = fn ($q) => $q->where('completed', false)->where(fn ($s) => $s->whereNull('status')->orWhere('status', '!=', 'done'));
            $counts['today_open'] = PlannerTask::query()->whereDate('task_date', $today)->where($mine)->where($open)->count();
            $counts['overdue'] = PlannerTask::query()->whereDate('task_date', '<', $today)
                ->whereDate('task_date', '>=', CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->subDays(DayBoard::OVERDUE_DAYS)->toDateString())
                ->where($mine)->where($open)->count();
            $person = $team->find($me);
            $counts['pool'] = PlannerTask::query()->whereNull('task_date')->whereNull('assigned_to_user_id')
                ->where(fn ($q) => $q->whereNull('employee_name')->orWhere('employee_name', ''))->where('completed', false)
                ->get(['task_group'])->filter(fn ($t) => $person === null || Team::mayTake($person, $t->task_group))->count();
        }

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            'accent'       => OrgAccent::of($orgId),
            'venue'        => ['timezone' => VenueClock::zone($orgId), 'today' => $today],
            // The full admin's Planner is the plan's `time_management`; without it the workspace shows what it would do.
            'features'     => ['time_management' => $entitled, 'voice' => \App\Services\Ai\SpeechToText::configured()],
            // `status` of the month's allowance (ok, warn, over), and whether the planner's AI can be asked now.
            'ai'           => ['status' => $budget['status'], 'percent' => $budget['percent'], 'ready' => $ai->status($org) === 'ready', 'state' => $ai->status($org)],
            'staff'        => [
                'id'   => (int) $user->id,
                'key'  => $me,
                'name' => (string) $user->name,
                'role' => TimeAccess::role($user),
                'can'  => TimeAccess::forBootstrap($user),
            ],
            'settings'     => [
                'window'          => ['start' => WorkWindow::toClock($window['start']), 'end' => WorkWindow::toClock($window['end'])],
                'minutes_per_day' => $catalogue->minutesPerDay(),
                'days_per_week'   => $catalogue->daysPerWeek(),
                'groups'          => $catalogue->groups(),
                'channels'        => $catalogue->channels(),
            ],
            'counts'       => $counts,
        ]);
    }

    /** My day: my board, what is next, my overdue work, my backlog and the pool I may take, this week, the day's note. */
    public function today(Request $request, DayBoard $board, Team $team): JsonResponse
    {
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        $user = $request->user();
        $me = 'u' . $user->id;
        $today = VenueClock::today($orgId);
        $day = $board->build($orgId, $today, [$me]);
        $mine = collect($day['people'])->firstWhere('key', $me);

        $next = null;
        if ($mine) {
            $open = array_values(array_filter($mine['tasks'], fn ($t) => !$t['done']));
            usort($open, fn ($a, $b) => [$a['start_time'] === null, $a['start_time'] ?? '', $a['priority_rank']] <=> [$b['start_time'] === null, $b['start_time'] ?? '', $b['priority_rank']]);
            $running = array_values(array_filter($open, fn ($t) => $t['running']));
            $later = array_values(array_filter($open, fn ($t) => $t['start_time'] === null || $t['end_time'] > ($day['now'] ?? '00:00')));
            $next = $running[0] ?? $later[0] ?? $open[0] ?? null;
        }

        $backlog = PlannerTask::query()->whereNull('task_date')->where('completed', false)
            ->where(fn ($q) => $q->where('assigned_to_user_id', $user->id)->orWhere(fn ($n) => $n->whereNull('assigned_to_user_id')->where('employee_name', (string) $user->name)))
            ->count();
        $person = $team->find($me);
        $pool = PlannerTask::query()->whereNull('task_date')->whereNull('assigned_to_user_id')
            ->where(fn ($q) => $q->whereNull('employee_name')->orWhere('employee_name', ''))->where('completed', false)
            ->orderByDesc('created_at')->limit(200)->get()
            ->filter(fn ($t) => $person === null || Team::mayTake($person, $t->task_group))->values();

        $monday = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->startOfWeek(CarbonImmutable::MONDAY);
        $week = [];
        $weekTasks = PlannerTask::query()->whereDate('task_date', '>=', $monday->toDateString())->whereDate('task_date', '<=', $monday->addDays(6)->toDateString())
            ->where(fn ($q) => $q->where('assigned_to_user_id', $user->id)->orWhere(fn ($n) => $n->whereNull('assigned_to_user_id')->where('employee_name', (string) $user->name)))
            ->get();
        for ($i = 0; $i < 7; $i++) {
            $date = $monday->addDays($i)->toDateString();
            $list = $weekTasks->filter(fn (PlannerTask $t) => TaskView::date($t) === $date);
            $week[] = [
                'date'    => $date,
                'tasks'   => $list->count(),
                'done'    => $list->filter(fn (PlannerTask $t) => TaskView::isDone($t))->count(),
                'minutes' => $list->sum(fn (PlannerTask $t) => TaskView::minutes($t)),
            ];
        }

        return response()->json([
            'date'     => $today,
            'now'      => $day['now'],
            'window'   => $day['window'],
            'me'       => $mine,
            'next'     => $next,
            // My own signals; a manager also hears that the day has work nobody has yet.
            'signals'  => array_values(array_filter($day['signals'], fn ($s) => ($s['person'] ?? null) === $me
                || ($s['code'] === 'unassigned' && TimeAccess::isManager($user)))),
            'backlog'  => ['mine' => $backlog, 'pool' => $pool->count(), 'pool_for_today' => $pool->filter(fn ($t) => $t->pool_horizon === 'day' && $t->pool_due_date && $t->pool_due_date->toDateString() <= $today)->count()],
            'pool_top' => $pool->sortBy(fn ($t) => [TaskView::priorityRank($t->priority), $t->pool_due_date?->toDateString() ?? '9999'])->take(5)->map(fn ($t) => TaskView::of($t, null, $today))->values(),
            'week'     => $week,
            'note'     => PlannerDayNote::query()->whereDate('note_date', $today)->value('note_text'),
        ]);
    }

    /** One day for the team (or one person): every lane, the unassigned work, the signals. */
    public function day(Request $request, DayBoard $board): JsonResponse
    {
        $data = $request->validate(['date' => 'required|date_format:Y-m-d', 'person' => 'nullable|string|max:200']);
        $orgId = (int) $request->attributes->get('workspace_org')->id;

        return response()->json($board->build($orgId, $data['date'], isset($data['person']) ? [$data['person']] : null) + [
            'note' => PlannerDayNote::query()->whereDate('note_date', $data['date'])->value('note_text'),
        ]);
    }

    /** Seven days from `start`, person by person: what each day holds against their capacity, with the day's tasks. */
    public function week(Request $request, DayBoard $board): JsonResponse
    {
        $data = $request->validate(['start' => 'required|date_format:Y-m-d', 'person' => 'nullable|string|max:200']);
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $data['start'], 'UTC');
        $only = isset($data['person']) ? [$data['person']] : null;

        $days = [];
        $people = [];
        $unassigned = [];
        for ($i = 0; $i < 7; $i++) {
            $date = $start->addDays($i)->toDateString();
            $b = $board->build($orgId, $date, $only);
            $days[] = ['date' => $date, 'weekday' => $b['weekday'], 'is_today' => $b['is_today'], 'totals' => $b['totals']];
            foreach ($b['people'] as $p) {
                $people[$p['key']] ??= ['key' => $p['key'], 'user_id' => $p['user_id'], 'name' => $p['name'], 'role' => $p['role'],
                    'listed' => $p['listed'], 'planned_minutes' => 0, 'capacity_minutes' => 0, 'days' => []];
                $people[$p['key']]['planned_minutes'] += $p['planned_minutes'];
                $people[$p['key']]['capacity_minutes'] += $p['capacity_minutes'];
                $people[$p['key']]['days'][] = [
                    'date' => $date, 'works' => $p['works'], 'planned_minutes' => $p['planned_minutes'], 'capacity_minutes' => $p['capacity_minutes'],
                    'load_pct' => $p['load_pct'], 'tasks' => $p['tasks'],
                ];
            }
            $unassigned[] = ['date' => $date, 'tasks' => $b['unassigned']];
        }
        foreach ($people as &$p) {
            $p['load_pct'] = $p['capacity_minutes'] > 0 ? (int) round($p['planned_minutes'] / $p['capacity_minutes'] * 100) : null;
            // A person who joined the lanes on a later day still has one cell per day.
            $byDate = collect($p['days'])->keyBy('date');
            $p['days'] = array_map(fn ($d) => $byDate[$d['date']] ?? ['date' => $d['date'], 'works' => false, 'planned_minutes' => 0, 'capacity_minutes' => 0, 'load_pct' => null, 'tasks' => []], $days);
        }
        unset($p);

        return response()->json(['start' => $start->toDateString(), 'days' => $days, 'people' => array_values($people), 'unassigned' => $unassigned]);
    }

    /**
     * The backlog in the workspace's task shape: the full admin's own `planner/backlog` decides what is listed (mine,
     * the pool as the person's skills allow, or the team's buckets for a manager — its refusals included), and the rows
     * it chose are read again as TaskView, in its order.
     */
    public function backlog(Request $request, \App\Http\Controllers\Api\V1\Admin\PlannerController $planner, Team $team): JsonResponse
    {
        $request->validate(['scope' => 'required|string|in:mine,pool,team']);
        $answer = $planner->backlog($request);
        if ($answer->getStatusCode() !== 200) {
            return $answer;
        }
        $data = $answer->getData(true);
        $today = VenueClock::today((int) $request->attributes->get('workspace_org')->id);
        $ids = $request->input('scope') === 'team'
            ? array_merge(array_column($data['pool'] ?? [], 'id'), ...array_map(fn ($b) => array_column($b['tasks'] ?? [], 'id'), $data['buckets'] ?? []))
            : array_column($data, 'id');
        $rows = PlannerTask::query()->with('subtasks')->whereIn('id', $ids ?: [0])->get()->keyBy('id');
        $view = fn (array $list) => array_values(array_filter(array_map(
            fn ($row) => isset($rows[$row['id']]) ? TaskView::of($rows[$row['id']], $team->ownerKey($rows[$row['id']]), $today) : null,
            $list,
        )));

        if ($request->input('scope') === 'team') {
            return response()->json([
                'pool'    => $view($data['pool'] ?? []),
                'buckets' => array_map(fn ($b) => ['key' => 'u' . $b['user_id'], 'user_id' => $b['user_id'], 'name' => $b['user_name'], 'tasks' => $view($b['tasks'] ?? [])], $data['buckets'] ?? []),
            ]);
        }

        return response()->json(['tasks' => $view($data)]);
    }

    /** The team as the planner knows it: profile, skills, preferred work, shown experience, this week's load. */
    public function people(Request $request, Team $team, Experience $experience, DayBoard $board): JsonResponse
    {
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        $shown = $experience->byPerson($orgId);
        $today = VenueClock::today($orgId);
        $b = $board->build($orgId, $today);
        $loads = collect($b['people'])->keyBy('key');

        return response()->json(['people' => array_map(fn (array $p) => $p + [
            'experience' => $shown[$p['key']] ?? ['done' => 0, 'on_time' => 0, 'groups' => []],
            'today'      => isset($loads[$p['key']])
                ? ['works' => $loads[$p['key']]['works'], 'planned_minutes' => $loads[$p['key']]['planned_minutes'], 'capacity_minutes' => $loads[$p['key']]['capacity_minutes'], 'load_pct' => $loads[$p['key']]['load_pct'], 'window' => $loads[$p['key']]['window']]
                : null,
        ], $team->people()), 'knowledge_max' => PlannerProfiles::KNOWLEDGE_MAX]);
    }

    /** A person's planner profile (a manager's): knowledge, hours, days, break. Skills stay the full admin's `team/{id}`. */
    public function updatePerson(Request $request, int $user, PlannerProfiles $profiles, Team $team): JsonResponse
    {
        TimeAccess::assertManager($request->user());
        $data = $request->validate([
            'knowledge'     => 'sometimes|nullable|string|max:' . PlannerProfiles::KNOWLEDGE_MAX,
            'work_start'    => ['sometimes', 'nullable', 'date_format:H:i'],
            'work_end'      => ['sometimes', 'nullable', 'date_format:H:i'],
            'work_days'     => 'sometimes|nullable|array|max:7',
            'work_days.*'   => 'integer|between:1,7',
            'break_minutes' => 'sometimes|nullable|integer|between:0,180',
        ]);
        $profiles->write($user, $data);

        // $team has read nobody yet in this request, so it reads the saved profile.
        return response()->json(['person' => $team->byUser($user)]);
    }

    public function insights(Request $request, TimeInsights $insights): JsonResponse
    {
        $data = $request->validate([
            'from'   => 'required|date_format:Y-m-d',
            'to'     => 'required|date_format:Y-m-d',
            'person' => 'nullable|string|max:200',
        ]);

        return response()->json($insights->for((int) $request->attributes->get('workspace_org')->id, $data['from'], $data['to'], $data['person'] ?? null));
    }

    /** How long a task like this usually takes, from the team's finished ones; null with too few to go by. */
    public function estimate(Request $request, Experience $experience): JsonResponse
    {
        $data = $request->validate([
            'task_group'    => 'nullable|string|max:80',
            'task_category' => 'nullable|string|max:120',
            'title'         => 'nullable|string|max:200',
        ]);

        return response()->json(['estimate' => $experience->estimate(
            (int) $request->attributes->get('workspace_org')->id, $data['task_group'] ?? null, $data['task_category'] ?? null, $data['title'] ?? null,
        )]);
    }

    public function start(Request $request, int $task, TaskClock $clock): JsonResponse
    {
        return response()->json($this->view($request, $clock->start($task)));
    }

    public function pause(Request $request, int $task, TaskClock $clock): JsonResponse
    {
        return response()->json($this->view($request, $clock->pause($task)));
    }

    public function finish(Request $request, int $task, TaskClock $clock): JsonResponse
    {
        return response()->json($this->view($request, $clock->finish($task)));
    }

    /** @return array<string, mixed> */
    private function view(Request $request, PlannerTask $task): array
    {
        $orgId = (int) $request->attributes->get('workspace_org')->id;

        return TaskView::of($task, app(Team::class)->ownerKey($task), VenueClock::today($orgId));
    }
}
