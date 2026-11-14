<?php

namespace App\Services\Time;

use App\Models\Organization;
use App\Models\PlannerTask;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * The planner's AI assistant (HexaTech Time Planner, 2026-11-14: "an AI assistant which will help to plan the day or the
 * week for our employees … and help to analyze how it goes"). A conversation: the person asks, Claude looks things up
 * through read-only tools — a day, a week, the pool and backlogs, the team, what the planner learned, a period's
 * figures, a task search — as often as it needs (PlannerAi::converse), answers, and proposes changes.
 *
 * It never writes. A proposed change is checked here against the asking person's own rights (PlanningMode, the skills
 * rule, a day not past) and handed back as the exact call of the full admin's own planner endpoints, which the person
 * applies — so the server decides twice. Comparing people is a manager's: a staff member's tools answer only their own
 * figures. Spend is `time_assistant`, one record per model call.
 */
final class Assistant
{
    public const HISTORY_MAX = 12;

    public const MESSAGE_MAX = 4000;

    /** @var list<array<string, mixed>> */
    private array $proposals = [];

    /** @var list<string> */
    private array $used = [];

    private int $orgId = 0;

    private string $today = '';

    private ?User $user = null;

    private bool $manager = false;

    public function __construct(
        private readonly PlannerAi $ai,
        private readonly DayBoard $boards,
        private readonly Team $team,
        private readonly Learning $learning,
        private readonly Knowledge $knowledge,
        private readonly Experience $experience,
        private readonly TimeInsights $insights,
        private readonly PlannerCatalogue $catalogue,
    ) {
    }

    /**
     * @param  list<array{role: string, content: string}>  $history  the person's message last
     * @return array{reply: string, proposals: list<array<string, mixed>>, used: list<string>, rounds: int}
     */
    public function turn(Organization $org, User $user, array $history, string $lang): array
    {
        $this->orgId = (int) $org->id;
        $this->user = $user;
        $this->manager = TimeAccess::isManager($user);
        $this->today = VenueClock::today($this->orgId);
        $this->proposals = [];
        $this->used = [];

        $answer = $this->ai->converse($this->orgId, $this->system($org, $user, $lang), $history, $this->tools(), fn (string $name, array $input) => $this->run($name, $input));

        return ['reply' => $answer['text'], 'proposals' => $this->proposals, 'used' => array_values(array_unique($this->used)), 'rounds' => $answer['rounds']];
    }

    private function system(Organization $org, User $user, string $lang): string
    {
        $language = PlannerAi::language($lang);
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $this->today, 'UTC');
        $now = $this->boards->build($this->orgId, $this->today, ['u' . $user->id])['now'] ?? null;
        $others = PlanningMode::mayPlanOthers($user) ? 'yes' : 'no (they plan only their own day)';
        $role = $this->manager ? 'a manager' : 'a staff member';
        $team = array_map(fn ($p) => array_filter([
            'person' => $p['key'], 'name' => $p['name'], 'job_title' => $p['profile']['job_title'] ?: null, 'level' => $p['profile']['level'],
            'manager' => $p['manager'] ?: null, 'account' => $p['has_account'] ? null : 'none (a name only)', 'skills' => $p['profile']['skills'] ?? 'any',
        ], fn ($v) => $v !== null), $this->team->people());
        $facts = json_encode([
            'business' => $this->knowledge->forAi() ?: null,
            'team'     => $team,
            'task_types' => $this->catalogue->groupNames(),
            'tasks'    => array_map(fn ($c) => ['key' => $c['key'], 'label' => $c['label'], 'types' => $c['groups']], $this->catalogue->channels()),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $name = (string) $org->name;
        $industry = (string) $org->resolved_industry;
        $me = 'u' . $user->id;

        return <<<TXT
You are the planning assistant of HexaTech Time Planner for {$name} (a {$industry} business). You help {$user->name}
({$role}, person key {$me}; may plan colleagues' days: {$others}) plan the team's days and weeks and understand how the
work goes. Today is {$this->today} ({$day->englishDayOfWeek}){$this->nowText($now)} at the venue; days and times are the venue's.

How you work:
- Look things up with the tools before you answer; never guess tasks, times, people or numbers.
- To change anything — add a task, give a task to someone, move it to a day or a time, set its length — call
  propose_changes. The person sees each change and applies it; you never change anything yourself and never say you did.
- Lengths: use what the planner learned (get_learning: real time against the plan) and the manager's typical lengths;
  say where a length comes from.
- Who does what: match skills, knowledge, job title, level, preferred work and the experience people have shown; keep the
  business's rules; spread the load; leave people their breaks; never plan someone on a day off.
- Comparing colleagues' performance is for managers; with anyone else talk only about their own work. Be fair and
  constructive: the aim is to help people do well.
- Answer briefly in {$language}: a few sentences or a short list. Name tasks and people as the planner does.

What the planner knows (JSON): {$facts}
TXT;
    }

    private function nowText(?string $now): string
    {
        return $now ? ", {$now}" : '';
    }

    /** @return list<array<string, mixed>> */
    private function tools(): array
    {
        $date = ['type' => 'string', 'description' => 'YYYY-MM-DD'];
        $person = ['type' => 'string', 'description' => 'A person key from the team'];

        return [
            ['name' => 'get_day', 'description' => 'One day person by person: hours, capacity, load, each task (id, title, time, minutes, type, priority, done), the work nobody has yet, and warnings.',
                'input_schema' => ['type' => 'object', 'properties' => ['date' => $date, 'person' => $person], 'required' => ['date']]],
            ['name' => 'get_week', 'description' => 'The week around a day (Monday to Sunday): per person and day, planned and available minutes and the tasks.',
                'input_schema' => ['type' => 'object', 'properties' => ['start' => $date, 'person' => $person], 'required' => ['start']]],
            ['name' => 'get_pool', 'description' => 'Work without a day: the open pool anyone suitable may take (with its due day) and each person\'s own backlog.',
                'input_schema' => ['type' => 'object', 'properties' => (object) []]],
            ['name' => 'get_people', 'description' => 'The team: job title, level, skills (task types they may take), preferred work, knowledge, strengths, what they develop, hours, work days and the experience they have shown.',
                'input_schema' => ['type' => 'object', 'properties' => (object) []]],
            ['name' => 'get_learning', 'description' => 'What the planner learned from the last weeks: per task type and task, planned and real length and the suggested one; per person, finished work, on time, speed against the team by type, strengths and where to support (other people\'s figures for managers only).',
                'input_schema' => ['type' => 'object', 'properties' => ['weeks' => ['type' => 'integer', 'description' => '1 to 26, default 8']]]],
            ['name' => 'get_insights', 'description' => 'A period\'s figures: tasks, finished, on time, planned and clocked time, load, by person and by type.',
                'input_schema' => ['type' => 'object', 'properties' => ['from' => $date, 'to' => $date, 'person' => $person], 'required' => ['from', 'to']]],
            ['name' => 'find_tasks', 'description' => 'Find tasks by words in the title, by person, by days; open ones only unless asked.',
                'input_schema' => ['type' => 'object', 'properties' => ['text' => ['type' => 'string'], 'person' => $person, 'from' => $date, 'to' => $date, 'include_done' => ['type' => 'boolean']]]],
            ['name' => 'propose_changes', 'description' => 'Propose changes for the person to apply: create_task, assign (a task to a person), move (to a day, a time, or back to the backlog with date null), set_length (minutes). Each is checked; refused ones come back with the reason.',
                'input_schema' => ['type' => 'object', 'properties' => ['changes' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => [
                    'type'       => ['type' => 'string', 'enum' => ['create_task', 'assign', 'move', 'set_length']],
                    'task_id'    => ['type' => 'integer'],
                    'title'      => ['type' => 'string'],
                    'date'       => ['type' => ['string', 'null'], 'description' => 'YYYY-MM-DD, or null for no day'],
                    'start_time' => ['type' => 'string', 'description' => 'HH:MM'],
                    'minutes'    => ['type' => 'integer'],
                    'person'     => $person,
                    'task_type'  => ['type' => 'string'],
                    'task'       => ['type' => 'string', 'description' => 'A task key or label'],
                    'priority'   => ['type' => 'string', 'enum' => ['High', 'Normal', 'Low']],
                    'note'       => ['type' => 'string', 'description' => 'Why, in a few words'],
                ], 'required' => ['type']]]], 'required' => ['changes']]],
        ];
    }

    /** @param array<string, mixed> $in */
    private function run(string $name, array $in): mixed
    {
        $this->used[] = $name;

        return match ($name) {
            'get_day'         => $this->day((string) ($in['date'] ?? $this->today), $this->personArg($in)),
            'get_week'        => $this->week((string) ($in['start'] ?? $this->today), $this->personArg($in)),
            'get_pool'        => $this->pool(),
            'get_people'      => $this->people(),
            'get_learning'    => $this->learned((int) ($in['weeks'] ?? Learning::WEEKS)),
            'get_insights'    => $this->period((string) ($in['from'] ?? ''), (string) ($in['to'] ?? ''), $this->personArg($in)),
            'find_tasks'      => $this->find($in),
            'propose_changes' => $this->propose((array) ($in['changes'] ?? [])),
            default           => ['error' => 'unknown_tool'],
        };
    }

    private function personArg(array $in): ?string
    {
        $p = $in['person'] ?? null;

        return is_string($p) && $this->team->find($p) !== null ? $p : null;
    }

    private static function isDate(string $d): bool
    {
        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int) substr($d, 5, 2), (int) substr($d, 8, 2), (int) substr($d, 0, 4));
    }

    /** @return array<string, mixed> */
    private function day(string $date, ?string $person): array
    {
        if (!self::isDate($date)) {
            return ['error' => 'bad_date'];
        }
        $b = $this->boards->build($this->orgId, $date, $person ? [$person] : null);

        return [
            'date' => $b['date'], 'weekday' => $b['weekday'], 'is_today' => $b['is_today'], 'now' => $b['now'],
            'people' => array_map(fn ($p) => [
                'person' => $p['key'], 'name' => $p['name'], 'works' => $p['works'], 'hours' => $p['window']['start'] . '-' . $p['window']['end'],
                'capacity_minutes' => $p['capacity_minutes'], 'planned_minutes' => $p['planned_minutes'], 'load_pct' => $p['load_pct'],
                'tasks' => array_map(fn ($t) => AiFacts::task($t), array_slice($p['tasks'], 0, 30)),
            ], $b['people']),
            'unassigned' => array_map(fn ($t) => AiFacts::task($t), array_slice($b['unassigned'], 0, 30)),
            'signals' => array_slice($b['signals'], 0, 15),
        ];
    }

    /** @return array<string, mixed> */
    private function week(string $start, ?string $person): array
    {
        if (!self::isDate($start)) {
            return ['error' => 'bad_date'];
        }
        $monday = CarbonImmutable::createFromFormat('!Y-m-d', $start, 'UTC')->startOfWeek(CarbonImmutable::MONDAY);
        $out = [];
        for ($i = 0; $i < 7; $i++) {
            $d = $monday->addDays($i)->toDateString();
            $b = $this->boards->build($this->orgId, $d, $person ? [$person] : null);
            $out[] = [
                'date' => $d, 'weekday' => $b['weekday'],
                'people' => array_map(fn ($p) => [
                    'person' => $p['key'], 'works' => $p['works'], 'capacity_minutes' => $p['capacity_minutes'], 'planned_minutes' => $p['planned_minutes'],
                    'tasks' => array_map(fn ($t) => ['task_id' => $t['id'], 'title' => mb_substr($t['title'], 0, 60), 'minutes' => $t['minutes'], 'time' => $t['start_time'], 'done' => $t['done']], array_slice($p['tasks'], 0, 10)),
                ], $b['people']),
                'unassigned' => count($b['unassigned']),
            ];
        }

        return ['from' => $monday->toDateString(), 'to' => $monday->addDays(6)->toDateString(), 'days' => $out];
    }

    /** @return array<string, mixed> */
    private function pool(): array
    {
        $open = fn ($q) => $q->where('completed', false)->where(fn ($s) => $s->whereNull('status')->orWhere('status', '!=', 'done'));
        $undated = PlannerTask::query()->whereNull('task_date')->where($open)->orderByDesc('created_at')->limit(200)->get();
        $pool = [];
        $backlog = [];
        $seeOthers = $this->manager || PlanningMode::mayPlanOthers($this->user);
        foreach ($undated as $t) {
            $owner = $this->team->ownerKey($t);
            $row = TaskView::of($t, $owner, $this->today);
            if ($owner === null) {
                $pool[] = $row;
            } elseif ($seeOthers || $owner === 'u' . $this->user->id) {
                $backlog[$owner][] = $row;
            }
        }
        // Without a length of their own, tasks show the typical or learned one (and say so).
        $facts = fn (array $rows) => array_map(fn ($t) => AiFacts::task($t), $this->learning->sized($this->orgId, $rows));

        return ['pool' => $facts(array_slice($pool, 0, 60)), 'backlog' => array_map(fn ($list) => $facts(array_slice($list, 0, 20)), $backlog)];
    }

    /** @return list<array<string, mixed>> */
    private function people(): array
    {
        $shown = $this->experience->byPerson($this->orgId);

        return array_map(fn ($p) => AiFacts::person($p, $shown[$p['key']] ?? null), $this->team->people());
    }

    /** @return array<string, mixed> */
    private function learned(int $weeks): array
    {
        $l = $this->learning->for($this->orgId, $weeks);
        $me = 'u' . $this->user->id;
        $people = $this->manager ? $l['people'] : array_values(array_filter($l['people'], fn ($p) => $p['person'] === $me));

        return [
            'from' => $l['from'], 'to' => $l['to'], 'totals' => $l['totals'],
            'types' => array_slice($l['types'], 0, 25), 'tasks' => array_slice($l['tasks'], 0, 25),
            'people' => array_map(fn ($p) => array_merge($p, ['types' => array_slice($p['types'], 0, 6)]), $people),
            'leaders' => $this->manager ? array_slice($l['leaders'], 0, 15) : null,
            'note' => $this->manager ? null : 'Only your own figures: comparing colleagues is for managers.',
        ];
    }

    /** @return array<string, mixed> */
    private function period(string $from, string $to, ?string $person): array
    {
        if (!self::isDate($from) || !self::isDate($to) || $to < $from) {
            return ['error' => 'bad_dates'];
        }
        if (CarbonImmutable::createFromFormat('!Y-m-d', $from, 'UTC')->diffInDays(CarbonImmutable::createFromFormat('!Y-m-d', $to, 'UTC')) >= TimeInsights::MAX_DAYS) {
            return ['error' => 'too_long', 'max_days' => TimeInsights::MAX_DAYS];
        }
        $me = 'u' . $this->user->id;
        if (!$this->manager && $person !== null && $person !== $me) {
            $person = $me;
        }

        return collect($this->insights->for($this->orgId, $from, $to, $person))->except(['by_day', 'hours'])->all();
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    private function find(array $in): array
    {
        $q = PlannerTask::query();
        $text = trim((string) ($in['text'] ?? ''));
        if ($text !== '') {
            $q->whereRaw('LOWER(title) LIKE ?', ['%' . mb_strtolower(addcslashes($text, '%_\\')) . '%']);
        }
        if (is_string($in['from'] ?? null) && self::isDate($in['from'])) {
            $q->whereDate('task_date', '>=', $in['from']);
        }
        if (is_string($in['to'] ?? null) && self::isDate($in['to'])) {
            $q->whereDate('task_date', '<=', $in['to']);
        }
        if (empty($in['include_done'])) {
            $q->where('completed', false)->where(fn ($s) => $s->whereNull('status')->orWhere('status', '!=', 'done'));
        }
        $person = $this->personArg($in);
        $rows = [];
        foreach ($q->orderByDesc('task_date')->limit(200)->get() as $t) {
            $owner = $this->team->ownerKey($t);
            if ($person !== null && $owner !== $person) {
                continue;
            }
            $rows[] = AiFacts::task(TaskView::of($t, $owner, $this->today));
            if (count($rows) >= 40) {
                break;
            }
        }

        return ['tasks' => $rows];
    }

    /**
     * Each change checked against the asking person's rights and the facts; the accepted ones are kept for the answer,
     * the refused ones go back to the AI with the reason.
     *
     * @param  array<mixed>  $changes
     * @return array<string, mixed>
     */
    private function propose(array $changes): array
    {
        $accepted = [];
        $refused = [];
        foreach (array_slice(array_values($changes), 0, 25) as $i => $c) {
            if (!is_array($c)) {
                continue;
            }
            $checked = $this->check($c);
            if (is_string($checked)) {
                $refused[] = ['index' => $i, 'reason' => $checked];
                continue;
            }
            $checked['id'] = 'p' . (count($this->proposals) + 1);
            $checked['note'] = mb_substr(trim((string) ($c['note'] ?? '')), 0, 200) ?: null;
            $this->proposals[] = $checked;
            $accepted[] = ['index' => $i, 'id' => $checked['id']];
        }

        return ['accepted' => $accepted, 'refused' => $refused,
            'reasons' => 'not_found: no such task; own_day_only: this person plans only their own day; skills: that person may not take this type; past_day: a day that has passed; invalid: something missing or malformed'];
    }

    /**
     * One change: the proposal (with the exact planner call that applies it) or the reason it is refused.
     *
     * @param  array<string, mixed>  $c
     * @return array<string, mixed>|string
     */
    private function check(array $c): array|string
    {
        $user = $this->user;
        $type = (string) ($c['type'] ?? '');
        $person = isset($c['person']) && is_string($c['person']) ? $this->team->find($c['person']) : null;
        if (isset($c['person']) && $c['person'] !== '' && $person === null) {
            return 'invalid';
        }
        $date = array_key_exists('date', $c) ? $c['date'] : false;
        if ($date !== false && $date !== null && (!is_string($date) || !self::isDate($date))) {
            return 'invalid';
        }
        if (is_string($date) && $date < $this->today) {
            return 'past_day';
        }
        $start = WorkWindow::isClock($c['start_time'] ?? null) ? (string) $c['start_time'] : null;
        $minutes = isset($c['minutes']) ? Knowledge::minutes($c['minutes']) : null;
        $assignment = $person ? Team::assignment($person) : ['assigned_to_user_id' => null, 'employee_name' => null];
        $who = $person ? ['key' => $person['key'], 'name' => $person['name']] : null;

        if ($type === 'create_task') {
            $title = mb_substr(trim((string) ($c['title'] ?? '')), 0, 200);
            if ($title === '') {
                return 'invalid';
            }
            if ($person && !PlanningMode::mayAssign($user, $assignment['assigned_to_user_id'], $assignment['employee_name'])) {
                return 'own_day_only';
            }
            $group = $this->catalogue->matchGroup($c['task_type'] ?? null);
            $category = $this->catalogue->matchChannel($c['task'] ?? null);
            $day = is_string($date) ? $date : null;
            $length = $minutes ?? $this->learning->size($this->orgId, $group, $category)['minutes'];
            $body = array_filter([
                'title' => $title, 'task_date' => $day, 'start_time' => $day ? $start : null,
                'end_time' => $day && $start ? WorkWindow::toClock(min(24 * 60 - 1, WorkWindow::toMinutes($start) + $length)) : null,
                'duration_minutes' => $length, 'priority' => in_array($c['priority'] ?? null, ['High', 'Normal', 'Low'], true) ? $c['priority'] : 'Normal',
                'task_group' => $group, 'task_category' => $category,
            ], fn ($v) => $v !== null) + $assignment + ($day === null && !$person ? ['pool_horizon' => 'general'] : []);

            return ['kind' => 'create', 'title' => $title, 'person' => $who, 'date' => $day, 'start_time' => $body['start_time'] ?? null,
                'minutes' => $length, 'task_type' => $group, 'request' => ['method' => 'post', 'path' => 'planner/tasks', 'body' => $body]];
        }

        $task = PlannerTask::query()->find((int) ($c['task_id'] ?? 0));
        if (!$task) {
            return 'not_found';
        }
        if (!PlanningMode::mayChange($user, $task)) {
            return 'own_day_only';
        }
        $base = ['task_id' => (int) $task->id, 'title' => (string) $task->title];

        if ($type === 'assign') {
            if (!$person) {
                return 'invalid';
            }
            if (!PlanningMode::mayAssign($user, $assignment['assigned_to_user_id'], $assignment['employee_name'])) {
                return 'own_day_only';
            }
            if (!$this->manager && $person['has_account'] && !Team::mayTake($person, $task->task_group)) {
                return 'skills';
            }
            $body = $assignment + ($date !== false ? ['task_date' => $date] : []) + ($start ? ['start_time' => $start] : []);

            return $base + ['kind' => 'assign', 'person' => $who, 'date' => $date !== false ? $date : TaskView::date($task), 'start_time' => $start,
                'request' => ['method' => 'patch', 'path' => "planner/tasks/{$task->id}/move", 'body' => $body]];
        }
        if ($type === 'move') {
            if ($date === false && $start === null) {
                return 'invalid';
            }
            $body = ($date !== false ? ['task_date' => $date] : []) + ($start ? ['start_time' => $start] : []);
            if ($date === false && TaskView::date($task) === null) {
                return 'invalid';
            }

            return $base + ['kind' => 'move', 'date' => $date !== false ? $date : TaskView::date($task), 'start_time' => $start,
                'request' => ['method' => 'patch', 'path' => "planner/tasks/{$task->id}/move", 'body' => $body]];
        }
        if ($type === 'set_length') {
            if ($minutes === null) {
                return 'invalid';
            }
            $from = TaskView::clock($task->start_time);
            $body = ['duration_minutes' => $minutes] + ($from ? ['end_time' => WorkWindow::toClock(min(24 * 60 - 1, WorkWindow::toMinutes($from) + $minutes))] : []);

            return $base + ['kind' => 'set_length', 'minutes' => $minutes, 'was' => TaskView::minutes($task),
                'request' => ['method' => 'put', 'path' => "planner/tasks/{$task->id}", 'body' => $body]];
        }

        return 'invalid';
    }
}
