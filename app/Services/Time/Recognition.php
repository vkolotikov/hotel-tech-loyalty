<?php

namespace App\Services\Time;

use App\Models\CrmSetting;
use App\Models\PlannerTask;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * Recognition (HexaTech Time Planner, 2026-11-28, the owner: "animated stimulus to employees, like badges … when they
 * finish important tasks, finish day minimum tasks, do more than others, fill calendar … a week rating system … so they
 * are interested to fill and do tasks"): points, a daily goal, a streak, badges and the week's ranking.
 *
 * Everything here is read from the planner's own tasks each time it is asked and nothing is stored: a task un-done takes
 * its points back, a day re-planned is judged as it now stands, and there is no award anybody can keep for work that is
 * no longer there. Only good things are counted — nobody's late or unfinished work is shown to anyone.
 *
 * - **Points for a finished task** (POINTS), credited on the venue day it was finished: a base, one per planned quarter
 *   of an hour (capped), more when it was high priority, finished on or before its day, or timed with Start and Finish.
 *   At most DAY_TASK_CAP tasks a day earn points (the best ones), so a day of made-up small tasks buys little.
 * - **Points for a day** (its own tasks, `task_date`): the daily goal (`planner_daily_goal` finished — or everything
 *   finished on a well-filled day, for work that comes in few long tasks), a clean sweep (everything planned finished,
 *   on a day that had at least the goal's number of tasks or was well filled) and a filled calendar (at least
 *   PLANNED_SHARE per cent of the person's working time planned; WorkWindow::capacityFor, the day board's own rule).
 * - **The streak**: days in a row with the daily goal met; a day without tasks is skipped, and today does not break it
 *   until it is over.
 * - **Badges** (BADGES: code → what it takes) for the week's work, the streak and last week's places.
 * - **The week's ranking** (Monday to Sunday, the venue's days) of everyone with an account who has work that week, by
 *   points, then finished tasks, then name; equal points share a place.
 *
 * Who sees the ranking is the organisation's choice (`planner_recognition`, a manager's, written only by
 * `PUT admin/time/settings/…`): `ranking` (everyone sees the week's whole table), `podium` (the top three and one's
 * own place), `own` (only one's own points and badges) or `off` (none of it). A manager sees the whole table in every
 * mode but `off`. Where nobody chose, it is `podium`: the best are celebrated and everyone knows their own place, but
 * nobody's last place is put before the whole team until a manager decides it should be.
 */
final class Recognition
{
    public const KEY = 'planner_recognition';

    public const GOAL_KEY = 'planner_daily_goal';

    public const RANKING = 'ranking';

    public const PODIUM = 'podium';

    public const OWN = 'own';

    public const OFF = 'off';

    public const MODES = [self::RANKING, self::PODIUM, self::OWN, self::OFF];

    public const GOAL_DEFAULT = 3;

    public const GOAL_MAX = 20;

    /** What earns points. The workspace shows these as they are; it never has numbers of its own. */
    public const POINTS = [
        'task'         => 5,
        'quarter_hour' => 1,
        'time_cap'     => 12,
        'important'    => 8,
        'on_time'      => 3,
        'clocked'      => 2,
        'daily_goal'   => 20,
        'clean_sweep'  => 25,
        'day_planned'  => 10,
    ];

    /** How many finished tasks of one day earn points (the best ones). */
    public const DAY_TASK_CAP = 15;

    /** The share of a person's working time that makes a day "well filled", in per cent. */
    public const PLANNED_SHARE = 60;

    /** How far back the streak (and last week) is read, in days. */
    public const LOOK_BACK = 35;

    /** The share of the week's finished tasks that must be on time for the on-time badge, in per cent. */
    public const ON_TIME_SHARE = 90;

    /** Each badge and what it takes (a count of the thing its code names). */
    public const BADGES = [
        'priority_hero' => 3,
        'goal_getter'   => 3,
        'clean_sweep'   => 1,
        'well_planned'  => 3,
        'on_time'       => 5,
        'timekeeper'    => 5,
        'streak_3'      => 3,
        'streak_7'      => 7,
        'podium'        => 1,
        'champion'      => 1,
    ];

    /** @var array<string, array<string, array{planned: int, done: int, minutes: int}>> person → day → the day's own tasks */
    private array $days = [];

    /** @var array<string, array<string, list<array{points: int, important: bool, on_time: bool, clocked: bool}>>> person → day finished → tasks */
    private array $earned = [];

    /** @var array<string, array<string, mixed>> the people with an account, by key */
    private array $people = [];

    /** @var array{start: int, end: int} */
    private array $orgWindow = ['start' => 0, 'end' => 0];

    private int $standard = 480;

    private int $goal = self::GOAL_DEFAULT;

    private string $today = '';

    public function __construct(private readonly Team $team, private readonly PlannerCatalogue $catalogue)
    {
    }

    /** Where no manager chose: the top three and one's own place. */
    public const DEFAULT_MODE = self::PODIUM;

    /** The organisation's choice (the current tenant's row); anything unreadable is the default. */
    public static function mode(): string
    {
        return self::readMode(CrmSetting::query()->where('key', self::KEY)->value('value'));
    }

    public static function readMode(mixed $value): string
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_string($decoded) ? $decoded : $value;
        }

        return in_array($value, self::MODES, true) ? $value : self::DEFAULT_MODE;
    }

    /** How many of a day's tasks make the daily goal: 1 to GOAL_MAX, else the default. */
    public static function goal(): int
    {
        return self::readGoal(CrmSetting::query()->where('key', self::GOAL_KEY)->value('value'));
    }

    /**
     * The organisation's choices in one read (the bootstrap asks every minute): who sees the ranking, the daily goal,
     * and whether characters are shown (Buddies).
     *
     * @return array{mode: string, goal: int, buddies: bool}
     */
    public static function settings(): array
    {
        $rows = CrmSetting::query()->whereIn('key', [self::KEY, self::GOAL_KEY, Buddies::KEY])->pluck('value', 'key');

        return [
            'mode'    => self::readMode($rows[self::KEY] ?? null),
            'goal'    => self::readGoal($rows[self::GOAL_KEY] ?? null),
            'buddies' => Buddies::readEnabled($rows[Buddies::KEY] ?? null),
        ];
    }

    public static function readGoal(mixed $value): int
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_numeric($decoded) ? $decoded : $value;
        }
        $n = is_numeric($value) ? (int) $value : 0;

        return $n >= 1 && $n <= self::GOAL_MAX ? $n : self::GOAL_DEFAULT;
    }

    /**
     * What this person sees: their own day, week, streak and badges, and the week's ranking as far as the
     * organisation's choice lets them see it.
     *
     * @return array<string, mixed>
     */
    public function for(int $orgId, User $user): array
    {
        $settings = self::settings();
        $mode = $settings['mode'];
        $manager = TimeAccess::isManager($user);
        if ($mode === self::OFF) {
            return ['mode' => $mode, 'manager' => $manager];
        }

        $this->today = VenueClock::today($orgId);
        $this->goal = $settings['goal'];
        // Characters (Buddies): each person's, where the organisation shows them at all.
        $buddies = $settings['buddies'];
        $this->orgWindow = WorkWindow::resolve();
        $this->standard = $this->catalogue->minutesPerDay();
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $this->today, 'UTC');
        $monday = $day->startOfWeek(CarbonImmutable::MONDAY);
        $weekFrom = $monday->toDateString();
        $weekTo = $monday->addDays(6)->toDateString();
        $this->read($day->subDays(self::LOOK_BACK)->toDateString(), VenueClock::zone($orgId));

        $ranking = $this->ranking($weekFrom, $this->today);
        $last = $this->ranking($monday->subDays(7)->toDateString(), $monday->subDay()->toDateString());
        $key = 'u' . $user->id;
        $mine = collect($ranking)->firstWhere('person', $key);
        $mineLast = collect($last)->firstWhere('person', $key);
        // A staff member in `own` mode is told no place: neither theirs nor anyone's.
        $placed = $manager || $mode !== self::OWN;
        // Last week's place counts only for someone who earned something that week.
        $lastRanks = [];
        foreach ($last as $r) {
            if ($r['points'] > 0) {
                $lastRanks[$r['person']] = $r['rank'];
            }
        }
        $lastRank = $lastRanks[$key] ?? null;

        $me = null;
        if (isset($this->people[$key])) {
            $week = $this->score($key, $weekFrom, $this->today);
            $state = $this->dayState($key, $this->today);
            $streak = $this->streak($key);
            $me = [
                'person' => $key,
                'name'   => $this->people[$key]['name'],
                // The character shown with this person, and what they chose themselves (a kind, `none`, or nothing yet).
                'buddy'        => $buddies ? Buddies::shown($this->people[$key]) : null,
                'buddy_choice' => Buddies::choice($this->people[$key]['profile']['buddy'] ?? null),
                'today'  => [
                    'planned'        => $state['planned'],
                    'done'           => $state['done'],
                    'goal'           => $this->goal,
                    'goal_met'       => $state['goal_met'],
                    'sweep'          => $state['sweep'],
                    'day_planned'    => $state['day_planned'],
                    'planned_pct'    => $state['planned_pct'],
                    'important_done' => count(array_filter($this->earned[$key][$this->today] ?? [], fn ($t) => $t['important'])),
                    'points'         => $state['points'],
                ],
                'week'   => [
                    'points'       => $week['points'],
                    'done'         => $week['done'],
                    'important'    => $week['important'],
                    'on_time_pct'  => $week['done'] > 0 ? (int) round($week['on_time'] / $week['done'] * 100) : null,
                    'clocked'      => $week['clocked'],
                    'days_goal'    => $week['days_goal'],
                    'days_sweep'   => $week['days_sweep'],
                    'days_planned' => $week['days_planned'],
                    'rank'         => $placed ? ($mine['rank'] ?? null) : null,
                    'of'           => $placed ? count($ranking) : null,
                ],
                'streak' => $streak,
                'badges' => $this->badges($week, $streak, $placed ? $lastRank : null, $placed),
                'last_week' => $mineLast ? ['points' => $mineLast['points'], 'rank' => $placed ? $mineLast['rank'] : null, 'of' => $placed ? count($last) : null] : null,
                'days'   => array_map(function (int $i) use ($monday, $key) {
                    $date = $monday->addDays($i)->toDateString();
                    $future = $date > $this->today;
                    $s = $future ? null : $this->dayState($key, $date);

                    return [
                        'date'        => $date,
                        'future'      => $future,
                        'points'      => $s['points'] ?? 0,
                        'planned'     => $s['planned'] ?? 0,
                        'done'        => $s['done'] ?? 0,
                        'goal_met'    => $s['goal_met'] ?? false,
                        'sweep'       => $s['sweep'] ?? false,
                        'day_planned' => $s['day_planned'] ?? false,
                    ];
                }, range(0, 6)),
            ];
        }

        $shown = match (true) {
            $manager, $mode === self::RANKING => $ranking,
            $mode === self::PODIUM             => array_values(array_filter($ranking, fn ($r) => $r['rank'] <= 3 || $r['person'] === $key)),
            default                            => array_values(array_filter($ranking, fn ($r) => $r['person'] === $key)),
        };

        return [
            'mode'    => $mode,
            'manager' => $manager,
            'buddies' => $buddies,
            'today'   => $this->today,
            'week'    => ['from' => $weekFrom, 'to' => $weekTo],
            'rules'   => [
                'points'        => self::POINTS,
                'daily_goal'    => $this->goal,
                'planned_share' => self::PLANNED_SHARE,
                'day_task_cap'  => self::DAY_TASK_CAP,
                'on_time_share' => self::ON_TIME_SHARE,
            ],
            'me'      => $me,
            'ranking' => array_map(function (array $r) use ($placed, $lastRanks, $key, $buddies) {
                $streak = $this->streak($r['person']);

                return [
                    'person'  => $r['person'],
                    'name'    => $r['name'],
                    'buddy'   => $buddies ? Buddies::shown($this->people[$r['person']]) : null,
                    'manager' => $r['manager'],
                    'points'  => $r['points'],
                    'done'    => $r['done'],
                    'rank'    => $placed ? $r['rank'] : null,
                    'me'      => $r['person'] === $key,
                    'streak'  => $streak,
                    // The same badges the person's own page counts (last week's places only where places are told).
                    'badges'  => count(array_filter(
                        $this->badges($r['score'], $streak, $placed ? ($lastRanks[$r['person']] ?? null) : null, $placed),
                        fn ($b) => $b['earned'],
                    )),
                ];
            }, $shown),
            'hidden'  => count($ranking) - count($shown),
        ];
    }

    /** Reads the tasks of the window once: each account's days (their own tasks) and what they finished, by day. */
    private function read(string $since, string $zone): void
    {
        $this->days = [];
        $this->earned = [];
        $this->people = [];
        foreach ($this->team->people() as $p) {
            if ($p['has_account']) {
                $this->people[$p['key']] = $p;
            }
        }
        $sinceUtc = CarbonImmutable::createFromFormat('!Y-m-d', $since, $zone)->utc();
        $today = $this->today;
        $tasks = PlannerTask::query()
            ->where(function ($q) use ($since, $today, $sinceUtc) {
                $q->where(fn ($d) => $d->whereDate('task_date', '>=', $since)->whereDate('task_date', '<=', $today))
                    ->orWhere('completed_at', '>=', $sinceUtc);
            })
            // The newest first, so a planner with more rows than the limit still counts this week whole.
            ->orderByDesc('id')
            ->limit(20000)
            ->get(['id', 'task_date', 'duration_minutes', 'start_time', 'end_time', 'actual_minutes', 'completed_at',
                'assigned_to_user_id', 'employee_name', 'completed', 'status', 'priority']);

        foreach ($tasks as $t) {
            $owner = $this->team->ownerKey($t);
            if ($owner === null || !isset($this->people[$owner])) {
                continue;
            }
            $date = TaskView::date($t);
            $done = TaskView::isDone($t);
            $minutes = TaskView::minutes($t);
            if ($date !== null && $date >= $since && $date <= $today) {
                $this->days[$owner][$date] ??= ['planned' => 0, 'done' => 0, 'minutes' => 0];
                $this->days[$owner][$date]['planned']++;
                $this->days[$owner][$date]['minutes'] += $minutes;
                if ($done) {
                    $this->days[$owner][$date]['done']++;
                }
            }
            if (!$done) {
                continue;
            }
            // Credited on the venue day it was finished (a row from before that was recorded: its own day).
            $finished = $t->completed_at ? $t->completed_at->copy()->setTimezone($zone)->toDateString() : $date;
            if ($finished === null || $finished < $since || $finished > $today) {
                continue;
            }
            $important = TaskView::priorityRank($t->priority) === 0;
            $onTime = $date !== null && $finished <= $date;
            $clocked = $t->actual_minutes !== null && (int) $t->actual_minutes > 0;
            $this->earned[$owner][$finished][] = [
                'points'    => self::POINTS['task']
                    + min(self::POINTS['time_cap'], (int) round($minutes / 15) * self::POINTS['quarter_hour'])
                    + ($important ? self::POINTS['important'] : 0)
                    + ($onTime ? self::POINTS['on_time'] : 0)
                    + ($clocked ? self::POINTS['clocked'] : 0),
                'important' => $important,
                'on_time'   => $onTime,
                'clocked'   => $clocked,
            ];
        }
    }

    /**
     * One day of one person: their own tasks, how full their calendar was, what the day earned.
     *
     * @return array{planned: int, done: int, planned_pct: ?int, day_planned: bool, goal_met: bool, sweep: bool, points: int}
     */
    private function dayState(string $key, string $date): array
    {
        $d = $this->days[$key][$date] ?? ['planned' => 0, 'done' => 0, 'minutes' => 0];
        $weekday = (int) CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC')->isoWeekday();
        $capacity = WorkWindow::capacityFor($this->orgWindow, $this->people[$key], $weekday, $this->standard);
        $dayPlanned = $capacity > 0 && $d['minutes'] * 100 >= $capacity * self::PLANNED_SHARE;
        $everything = $d['planned'] >= 1 && $d['done'] === $d['planned'];
        // A day of few long tasks reaches the goal by finishing all of them, when the day was well filled.
        $goalMet = $d['done'] >= $this->goal || ($everything && $dayPlanned);
        $sweep = $everything && ($d['planned'] >= $this->goal || $dayPlanned);

        $tasks = array_column($this->earned[$key][$date] ?? [], 'points');
        rsort($tasks);
        $points = array_sum(array_slice($tasks, 0, self::DAY_TASK_CAP))
            + ($goalMet ? self::POINTS['daily_goal'] : 0)
            + ($sweep ? self::POINTS['clean_sweep'] : 0)
            + ($dayPlanned ? self::POINTS['day_planned'] : 0);

        return [
            'planned'     => $d['planned'],
            'done'        => $d['done'],
            'planned_pct' => $capacity > 0 ? (int) round($d['minutes'] / $capacity * 100) : null,
            'day_planned' => $dayPlanned,
            'goal_met'    => $goalMet,
            'sweep'       => $sweep,
            'points'      => $points,
        ];
    }

    /**
     * A person's days from `from` to `to` added up.
     *
     * @return array{points: int, done: int, important: int, on_time: int, clocked: int, days_goal: int, days_sweep: int, days_planned: int, planned: int}
     */
    private function score(string $key, string $from, string $to): array
    {
        $sum = ['points' => 0, 'done' => 0, 'important' => 0, 'on_time' => 0, 'clocked' => 0, 'days_goal' => 0, 'days_sweep' => 0, 'days_planned' => 0, 'planned' => 0];
        for ($day = CarbonImmutable::createFromFormat('!Y-m-d', $from, 'UTC'); $day->toDateString() <= $to; $day = $day->addDay()) {
            $date = $day->toDateString();
            $state = $this->dayState($key, $date);
            $finished = $this->earned[$key][$date] ?? [];
            $sum['points'] += $state['points'];
            $sum['planned'] += $state['planned'];
            $sum['done'] += count($finished);
            $sum['important'] += count(array_filter($finished, fn ($t) => $t['important']));
            $sum['on_time'] += count(array_filter($finished, fn ($t) => $t['on_time']));
            $sum['clocked'] += count(array_filter($finished, fn ($t) => $t['clocked']));
            $sum['days_goal'] += $state['goal_met'] ? 1 : 0;
            $sum['days_sweep'] += $state['sweep'] ? 1 : 0;
            $sum['days_planned'] += $state['day_planned'] ? 1 : 0;
        }

        return $sum;
    }

    /** Days in a row with the daily goal met: a day without tasks is skipped, and today counts only once it is met. */
    private function streak(string $key): int
    {
        $streak = 0;
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $this->today, 'UTC');
        for ($i = 0; $i <= self::LOOK_BACK; $i++) {
            $date = $day->subDays($i)->toDateString();
            if (($this->days[$key][$date]['planned'] ?? 0) < 1) {
                continue;
            }
            if ($this->dayState($key, $date)['goal_met']) {
                $streak++;
            } elseif ($i > 0) {
                break;
            }
        }

        return $streak;
    }

    /**
     * Everyone with an account who has work in the days from `from` to `to`, best first; equal points share a place.
     *
     * @return list<array{person: string, name: string, manager: bool, points: int, done: int, rank: int, score: array<string, int>}>
     */
    private function ranking(string $from, string $to): array
    {
        $rows = [];
        foreach ($this->people as $key => $p) {
            $score = $this->score($key, $from, $to);
            if ($score['points'] > 0 || $score['planned'] > 0) {
                $rows[] = ['person' => $key, 'name' => $p['name'], 'manager' => $p['manager'], 'points' => $score['points'], 'done' => $score['done'], 'rank' => 0, 'score' => $score];
            }
        }
        usort($rows, fn ($a, $b) => [$b['points'], $b['done'], $a['name']] <=> [$a['points'], $a['done'], $b['name']]);
        $rank = 0;
        $before = null;
        foreach ($rows as $i => $row) {
            if ($row['points'] !== $before) {
                $rank++;
                $before = $row['points'];
            }
            $rows[$i]['rank'] = $rank;
        }

        return $rows;
    }

    /**
     * The badges and how far each has got. Last week's places are left out for someone who is told no place.
     *
     * @param  array<string, int>  $week
     * @return list<array{code: string, earned: bool, have: int, need: int}>
     */
    private function badges(array $week, int $streak, ?int $lastRank, bool $placed): array
    {
        $badge = fn (string $code, int $have, ?bool $earned = null) => [
            'code'   => $code,
            'earned' => $earned ?? $have >= self::BADGES[$code],
            'have'   => min($have, self::BADGES[$code]),
            'need'   => self::BADGES[$code],
        ];
        $onTime = $week['done'] >= self::BADGES['on_time'] && $week['on_time'] * 100 >= $week['done'] * self::ON_TIME_SHARE;
        $out = [
            $badge('priority_hero', $week['important']),
            $badge('goal_getter', $week['days_goal']),
            $badge('clean_sweep', $week['days_sweep']),
            $badge('well_planned', $week['days_planned']),
            // Not earned until the share holds too: a count that reads "5 of 5" would say otherwise.
            $badge('on_time', $onTime ? $week['on_time'] : min($week['on_time'], self::BADGES['on_time'] - 1), $onTime),
            $badge('timekeeper', $week['clocked']),
            $badge('streak_3', $streak),
            $badge('streak_7', $streak),
        ];
        if ($placed) {
            $out[] = $badge('podium', $lastRank !== null && $lastRank <= 3 ? 1 : 0);
            $out[] = $badge('champion', $lastRank === 1 ? 1 : 0);
        }

        return $out;
    }
}
