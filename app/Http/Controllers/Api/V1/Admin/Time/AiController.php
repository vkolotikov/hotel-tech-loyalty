<?php

namespace App\Http\Controllers\Api\V1\Admin\Time;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\PlannerTask;
use App\Services\Ai\SpeechToText;
use App\Services\Appointments\VenueClock;
use App\Services\Time\DayBoard;
use App\Services\Time\DayPlanner;
use App\Services\Time\Experience;
use App\Services\Time\PlanApplier;
use App\Services\Time\PlannerAi;
use App\Services\Time\PlannerCatalogue;
use App\Services\Time\TaskView;
use App\Services\Time\Team;
use App\Services\Time\TimeAccess;
use App\Services\Time\TimeInsights;
use App\Services\Time\TimeRefused;
use App\Services\Time\WorkWindow;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech Time Planner's AI (2026-11-09): plan a day, review a day or a period, tasks from text or a voice note, and
 * the voice note's text. Every answer is a proposal for a person; only `plan/apply` writes, and only what the person
 * accepted (PlanApplier). Planning falls back to the rules (DayPlanner) when the AI cannot be asked or fails, and says
 * so (`source`, `ai_status`); the review and the capture are the AI's alone and refuse in our words.
 */
class AiController extends Controller
{
    /** Most tasks one plan places. */
    private const MAX_CANDIDATES = 60;

    public function plan(Request $request, DayBoard $boards, DayPlanner $planner, PlannerAi $ai, Experience $experience, Team $team): JsonResponse
    {
        $data = $request->validate([
            'date'             => 'required|date_format:Y-m-d',
            'scope'            => 'required|string|in:me,person,team',
            'person'           => 'nullable|required_if:scope,person|string|max:200',
            'include_pool'     => 'sometimes|boolean',
            'include_overdue'  => 'sometimes|boolean',
            'include_timed'    => 'sometimes|boolean',
            'use_ai'           => 'sometimes|boolean',
            'instruction'      => 'nullable|string|max:500',
            'lang'             => 'nullable|string|in:en,ru,de,fr,es',
        ]);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $manager = TimeAccess::isManager($user);
        $me = 'u' . $user->id;
        $today = VenueClock::today($orgId);
        if ($data['date'] < $today) {
            throw new TimeRefused('past_day', 'A day that has passed cannot be planned.', 422);
        }

        $scope = (string) $data['scope'];
        $scopeKeys = match ($scope) {
            'person' => [(string) $data['person']],
            'team'   => array_map(fn ($p) => $p['key'], $team->people()),
            default  => [$me],
        };
        if ($scopeKeys !== [$me] && !$manager) {
            throw TimeRefused::managerOnly();
        }
        foreach ($scopeKeys as $key) {
            if ($team->find($key) === null) {
                throw new TimeRefused('no_person', 'That person is not on the team.', 422);
            }
        }
        $assignOthers = $scope === 'team';

        $board = $boards->build($orgId, $data['date'], $scopeKeys);
        $candidates = $this->candidates($board, $scopeKeys, $data, $today, $team);
        $shown = $experience->byPerson($orgId);
        $options = ['scope' => $scopeKeys, 'assign_others' => $assignOthers];

        if ($candidates === []) {
            return response()->json(['date' => $data['date'], 'source' => 'rules', 'ai_status' => $ai->status($org), 'summary' => '',
                'proposals' => [], 'unplaced' => [], 'people' => $this->names($board)]);
        }

        $status = ($data['use_ai'] ?? true) ? $ai->status($org) : 'off';
        $summary = '';
        $source = 'rules';
        $aiLines = [];
        if ($status === 'ready') {
            try {
                $answer = $ai->planDay($orgId, $this->planFacts($board, $candidates, $shown, $assignOthers), $data['instruction'] ?? null, $data['lang'] ?? 'en');
                $aiLines = $answer['proposals'];
                $summary = $answer['summary'];
                $source = 'ai';
            } catch (TimeRefused $e) {
                $status = 'failed';
            }
        }
        $result = $planner->merge($board, $candidates, $aiLines, $shown, $options);

        return response()->json([
            'date'      => $data['date'],
            'source'    => $source,
            'ai_status' => $status,
            'summary'   => $summary,
            'proposals' => $result['proposals'],
            'unplaced'  => $result['unplaced'],
            'people'    => $this->names($board),
        ]);
    }

    public function apply(Request $request, PlanApplier $applier): JsonResponse
    {
        $data = $request->validate([
            'date'                        => 'required|date_format:Y-m-d',
            'lines'                       => 'required|array|min:1|max:' . self::MAX_CANDIDATES,
            'lines.*.task_id'             => 'required|integer',
            'lines.*.person'              => 'required|string|max:200',
            'lines.*.start_time'          => 'required|date_format:H:i',
            'lines.*.duration_minutes'    => 'required|integer|min:5|max:720',
            'lines.*.seen'                => 'nullable|string|max:40',
        ]);
        $orgId = (int) $request->attributes->get('workspace_org')->id;
        if ($data['date'] < VenueClock::today($orgId)) {
            throw new TimeRefused('past_day', 'A day that has passed cannot be planned.', 422);
        }
        $user = $request->user();

        return response()->json($applier->apply($user, TimeAccess::isManager($user), $data['date'], $data['lines']));
    }

    /** The AI's read of a day (`kind=day`) or a period (`kind=period`), with suggestions it may act on. */
    public function review(Request $request, PlannerAi $ai, DayBoard $boards, TimeInsights $insights, Team $team): JsonResponse
    {
        $data = $request->validate([
            'kind'   => 'required|string|in:day,period',
            'date'   => 'required_if:kind,day|nullable|date_format:Y-m-d',
            'from'   => 'required_if:kind,period|nullable|date_format:Y-m-d',
            'to'     => 'required_if:kind,period|nullable|date_format:Y-m-d',
            'person' => 'nullable|string|max:200',
            'lang'   => 'nullable|string|in:en,ru,de,fr,es',
        ]);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $ai->assertReady($org);
        $only = isset($data['person']) ? [(string) $data['person']] : null;

        if ($data['kind'] === 'day') {
            $board = $boards->build($orgId, $data['date'], $only);
            $facts = $this->reviewFacts($board);
            $taskIds = collect($board['people'])->flatMap(fn ($p) => array_column($p['tasks'], 'id'))
                ->merge(array_column($board['unassigned'], 'id'))->all();
        } else {
            $period = $insights->for($orgId, $data['from'], $data['to'], $only[0] ?? null);
            $facts = collect($period)->except(['by_day', 'hours'])->all();
            $taskIds = [];
        }
        $answer = $ai->review($orgId, $data['kind'], $facts, $data['lang'] ?? 'en');
        $keys = array_map(fn ($p) => $p['key'], $team->people());
        $answer['suggestions'] = array_map(fn (array $s) => [
            'title'  => mb_substr(trim((string) ($s['title'] ?? '')), 0, 160),
            'detail' => mb_substr(trim((string) ($s['detail'] ?? '')), 0, 400),
            'action' => $this->checkedAction($s['action'] ?? null, $taskIds, $keys),
        ], $answer['suggestions']);

        return response()->json($answer + ['kind' => $data['kind']]);
    }

    /** Tasks from text (typed, pasted or a voice note's), matched to the team's people, types and tasks, for a person to check. */
    public function capture(Request $request, PlannerAi $ai, Team $team, PlannerCatalogue $catalogue, Experience $experience): JsonResponse
    {
        $data = $request->validate([
            'text' => 'required|string|min:2|max:10000',
            'date' => 'nullable|date_format:Y-m-d',
            'lang' => 'nullable|string|in:en,ru,de,fr,es',
        ]);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $ai->assertReady($org);
        $today = VenueClock::today($orgId);
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC');
        $people = $team->people();

        $found = $ai->capture($orgId, $data['text'], [
            'today'       => $today,
            'weekday'     => $day->englishDayOfWeek,
            'planning_for'=> $data['date'] ?? $today,
            'me'          => (string) $request->user()->name,
            'team'        => array_map(fn ($p) => $p['name'], $people),
            'task_types'  => $catalogue->groupNames(),
            'tasks'       => array_map(fn ($c) => $c['label'], $catalogue->channels()),
        ], $data['lang'] ?? 'en');

        $latest = $day->addYear()->toDateString();
        $drafts = [];
        foreach ($found as $t) {
            $title = mb_substr(trim((string) ($t['title'] ?? '')), 0, 200);
            if ($title === '') {
                continue;
            }
            $date = is_string($t['date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $t['date']) && checkdate((int) substr($t['date'], 5, 2), (int) substr($t['date'], 8, 2), (int) substr($t['date'], 0, 4))
                && $t['date'] >= $today && $t['date'] <= $latest ? $t['date'] : null;
            $group = $catalogue->matchGroup($t['task_group'] ?? null);
            $category = $catalogue->matchChannel($t['task'] ?? null);
            $person = $this->matchPerson($people, $t['person_name'] ?? null);
            $minutes = (int) ($t['duration_minutes'] ?? 0);
            $estimate = null;
            if ($minutes < 5 || $minutes > 720) {
                $minutes = null;
                $estimate = $experience->estimate($orgId, $group, $category, $title);
            }
            $drafts[] = [
                'title'            => $title,
                'task_date'        => $date,
                'start_time'       => $date && WorkWindow::isClock($t['start_time'] ?? null) ? $t['start_time'] : null,
                'duration_minutes' => $minutes ?? $estimate['minutes'] ?? null,
                'estimated'        => $minutes === null && $estimate !== null,
                'priority'         => in_array($t['priority'] ?? null, ['High', 'Normal', 'Low'], true) ? $t['priority'] : 'Normal',
                'task_group'       => $group,
                'task_category'    => $category,
                'person'           => $person['key'] ?? null,
                'assigned_to_user_id' => $person['user_id'] ?? null,
                'employee_name'    => $person['name'] ?? null,
                'person_named'     => $person === null && trim((string) ($t['person_name'] ?? '')) !== '' ? mb_substr(trim((string) $t['person_name']), 0, 150) : null,
                'description'      => ($d = trim((string) ($t['description'] ?? ''))) !== '' ? mb_substr($d, 0, 2000) : null,
                'subtasks'         => array_values(array_slice(array_filter(array_map(fn ($s) => is_string($s) ? mb_substr(trim($s), 0, 200) : '', (array) ($t['subtasks'] ?? []))), 0, 12)),
            ];
        }

        return response()->json(['tasks' => $drafts]);
    }

    /** A voice note's text (the inbox's own rule, SpeechToText); the planner then reads it with capture. */
    public function transcribe(Request $request, SpeechToText $speech): JsonResponse
    {
        $request->validate(['audio' => SpeechToText::RULES, 'language' => 'nullable|string|max:8']);
        $failure = null;
        $result = $speech->transcribe($request->file('audio'), $request->input('language'), $failure);
        if ($result === null) {
            throw $failure === 'unavailable'
                ? new TimeRefused('transcription_unavailable', 'Voice input is not set up for this workspace yet.', 503)
                : new TimeRefused('transcription_failed', 'The recording could not be turned into text. Please try again.', 502);
        }

        return response()->json($result);
    }

    /**
     * What the plan places: the open tasks of the day for the people in scope (untimed ones, or every one with
     * `include_timed`), the day's unassigned work when planning the team, and, when asked, their overdue work and the
     * pool tasks they may take.
     *
     * @return list<array<string, mixed>>
     */
    private function candidates(array $board, array $scopeKeys, array $data, string $today, Team $team): array
    {
        $out = [];
        $timed = (bool) ($data['include_timed'] ?? false);
        foreach ($board['people'] as $p) {
            foreach ($p['tasks'] as $t) {
                if (!$t['done'] && !$t['running'] && ($timed || $t['start_time'] === null)) {
                    $out[] = $t + ['from' => 'day'];
                }
            }
        }
        if ($data['scope'] === 'team' || ($data['include_pool'] ?? false)) {
            foreach ($board['unassigned'] as $t) {
                if (!$t['done'] && ($timed || $t['start_time'] === null || $data['scope'] === 'team')) {
                    $out[] = $t + ['from' => 'unassigned'];
                }
            }
        }
        if ($data['include_overdue'] ?? false) {
            $since = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->subDays(DayBoard::OVERDUE_DAYS)->toDateString();
            $late = PlannerTask::query()->with('subtasks')->whereDate('task_date', '<', $today)->whereDate('task_date', '>=', $since)
                ->where('completed', false)->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'done'))
                ->orderBy('task_date')->limit(200)->get();
            foreach ($late as $t) {
                if (in_array($team->ownerKey($t), $scopeKeys, true)) {
                    $out[] = TaskView::of($t, $team->ownerKey($t), $today) + ['from' => 'overdue'];
                }
            }
        }
        if ($data['include_pool'] ?? false) {
            $people = array_values(array_filter(array_map(fn ($k) => $team->find($k), $scopeKeys)));
            $pool = PlannerTask::query()->with('subtasks')->whereNull('task_date')->whereNull('assigned_to_user_id')
                ->where(fn ($q) => $q->whereNull('employee_name')->orWhere('employee_name', ''))->where('completed', false)
                ->orderByDesc('created_at')->limit(200)->get()
                ->filter(fn (PlannerTask $t) => $t->pool_horizon !== 'day' || ($t->pool_due_date && $t->pool_due_date->toDateString() <= $data['date']) || TaskView::priorityRank($t->priority) === 0)
                ->filter(fn (PlannerTask $t) => collect($people)->contains(fn ($p) => Team::mayTake($p, $t->task_group)))
                ->sortBy(fn (PlannerTask $t) => [TaskView::priorityRank($t->priority), $t->pool_due_date?->toDateString() ?? '9999-12-31', -$t->id]);
            foreach ($pool as $t) {
                $out[] = TaskView::of($t, null, $today) + ['from' => 'pool'];
            }
        }

        $seen = [];
        $unique = [];
        foreach ($out as $t) {
            if (!isset($seen[$t['id']])) {
                $seen[$t['id']] = true;
                $unique[] = $t;
            }
        }

        return array_slice($unique, 0, self::MAX_CANDIDATES);
    }

    /** The facts the AI plans from: people in scope with their day, and the tasks to place. */
    private function planFacts(array $board, array $candidates, array $shown, bool $assignOthers): array
    {
        $placing = array_flip(array_column($candidates, 'id'));

        return [
            'date'          => $board['date'],
            'weekday'       => CarbonImmutable::createFromFormat('!Y-m-d', $board['date'], 'UTC')->englishDayOfWeek,
            'now'           => $board['now'],
            'assign_others' => $assignOthers,
            'people'        => array_map(fn ($p) => [
                'person'     => $p['key'],
                'name'       => $p['name'],
                'manager'    => $p['manager'],
                'works'      => $p['works'],
                'hours'      => $p['window']['start'] . '-' . $p['window']['end'],
                'break_minutes'    => $p['break_minutes'],
                'capacity_minutes' => $p['capacity_minutes'],
                'skills'     => $p['skills'] ?? 'any',
                'prefers'    => $p['prefers'],
                'knowledge'  => mb_substr((string) $p['knowledge'], 0, 600),
                'experience' => collect($shown[$p['key']]['groups'] ?? [])->take(8)->map(fn ($g, $name) => "{$g['done']} done, " . ($g['done'] > 0 ? (int) round($g['on_time'] / $g['done'] * 100) : 0) . "% on time, ~{$g['avg_minutes']} min")->all(),
                'busy'       => array_values(array_map(fn ($t) => $t['start_time'] . '-' . $t['end_time'] . ' ' . mb_substr($t['title'], 0, 60),
                    array_filter($p['tasks'], fn ($t) => $t['start_time'] !== null && !isset($placing[$t['id']])))),
            ], $board['people']),
            'tasks'         => array_map(fn ($t) => [
                'task_id'  => $t['id'],
                'title'    => mb_substr($t['title'], 0, 120),
                'type'     => $t['task_group'],
                'task'     => $t['task_category'],
                'priority' => $t['priority'],
                'minutes'  => $t['minutes'],
                'owner'    => $t['owner'],
                'from'     => $t['from'],
                'due'      => $t['task_date'] ?? $t['pool_due_date'],
                'notes'    => $t['description'] ? mb_substr((string) $t['description'], 0, 160) : null,
            ], $candidates),
        ];
    }

    /** The facts the AI reviews a day from. */
    private function reviewFacts(array $board): array
    {
        return [
            'date'       => $board['date'],
            'is_today'   => $board['is_today'],
            'now'        => $board['now'],
            'totals'     => $board['totals'],
            'signals'    => $board['signals'],
            'people'     => array_map(fn ($p) => [
                'person' => $p['key'], 'name' => $p['name'], 'works' => $p['works'], 'hours' => $p['window']['start'] . '-' . $p['window']['end'],
                'capacity_minutes' => $p['capacity_minutes'], 'planned_minutes' => $p['planned_minutes'], 'done_minutes' => $p['done_minutes'],
                'skills' => $p['skills'] ?? 'any', 'prefers' => $p['prefers'],
                'tasks' => array_map(fn ($t) => ['task_id' => $t['id'], 'title' => mb_substr($t['title'], 0, 80), 'time' => $t['start_time'] ? $t['start_time'] . '-' . $t['end_time'] : null,
                    'minutes' => $t['minutes'], 'priority' => $t['priority'], 'type' => $t['task_group'], 'done' => $t['done']], array_slice($p['tasks'], 0, 30)),
            ], $board['people']),
            'unassigned' => array_map(fn ($t) => ['task_id' => $t['id'], 'title' => mb_substr($t['title'], 0, 80), 'minutes' => $t['minutes'], 'priority' => $t['priority'], 'type' => $t['task_group']], array_slice($board['unassigned'], 0, 30)),
        ];
    }

    /** A suggestion's action when it names only this day's tasks and the team's people; else null. */
    private function checkedAction(mixed $action, array $taskIds, array $keys): ?array
    {
        if (!is_array($action) || !in_array($action['type'] ?? null, ['assign', 'move_day', 'set_time'], true)) {
            return null;
        }
        $id = (int) ($action['task_id'] ?? 0);
        if (!in_array($id, $taskIds, true)) {
            return null;
        }

        return match ($action['type']) {
            'assign'   => in_array($action['person'] ?? null, $keys, true) ? ['type' => 'assign', 'task_id' => $id, 'person' => $action['person']] : null,
            'move_day' => is_string($action['date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $action['date']) ? ['type' => 'move_day', 'task_id' => $id, 'date' => $action['date']] : null,
            'set_time' => WorkWindow::isClock($action['start_time'] ?? null) ? ['type' => 'set_time', 'task_id' => $id, 'start_time' => $action['start_time']] : null,
        };
    }

    /** The team member a name means: the same name, else the only one with that first name, else the only one it is part of. */
    private function matchPerson(array $people, mixed $named): ?array
    {
        $named = mb_strtolower(trim((string) $named));
        if ($named === '') {
            return null;
        }
        foreach ($people as $p) {
            if (mb_strtolower($p['name']) === $named) {
                return $p;
            }
        }
        $first = array_values(array_filter($people, fn ($p) => mb_strtolower(explode(' ', $p['name'])[0]) === $named));
        if (count($first) === 1) {
            return $first[0];
        }
        $part = array_values(array_filter($people, fn ($p) => mb_strlen($named) >= 3 && str_contains(mb_strtolower($p['name']), $named)));

        return count($part) === 1 ? $part[0] : null;
    }

    /** @return list<array{key: string, name: string}> */
    private function names(array $board): array
    {
        return array_map(fn ($p) => ['key' => $p['key'], 'name' => $p['name']], $board['people']);
    }
}
