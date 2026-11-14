<?php

namespace App\Services\Time;

use App\Models\Organization;
use App\Models\User;

/**
 * The planner's coach (HexaTech Time Planner, 2026-11-14): what the AI knows and lacks (AiReadiness), what the planner
 * learned (Learning), and two things a manager asks the AI for —
 *
 * - strategy(): recommendations for the team (durations, training, cross-skilling, schedule, recognition, process,
 *   data), each with a `fix` the planner can make when it is one change — a type's or task's typical length (saved
 *   through the planner's settings) or a type added to a person's skills (the full admin's `PUT team/{id}`); a fix is
 *   kept only when it names a type, task or person that exists and changes something;
 * - draft(): what to teach the AI, drafted from the business's own data (people, task types and tasks, the business),
 *   cleaned to what the writers take; nothing is saved until the manager accepts a line.
 *
 * Comparing people is a manager's: overview() answers a staff member only their own figures.
 */
final class Coach
{
    public function __construct(
        private readonly PlannerAi $ai,
        private readonly Learning $learning,
        private readonly AiReadiness $readiness,
        private readonly Knowledge $knowledge,
        private readonly Team $team,
        private readonly Experience $experience,
        private readonly PlannerCatalogue $catalogue,
    ) {
    }

    /** @return array<string, mixed> */
    public function overview(int $orgId, User $user, int $weeks): array
    {
        $manager = TimeAccess::isManager($user);
        $learned = $this->learning->for($orgId, $weeks);
        if (!$manager) {
            $learned['people'] = array_values(array_filter($learned['people'], fn ($p) => $p['person'] === 'u' . $user->id));
            $learned['leaders'] = [];
        }

        return [
            'readiness' => $this->readiness->for($orgId),
            'learning'  => $learned,
            'knowledge' => ['context' => $this->knowledge->context(), 'types' => (object) $this->knowledge->typeNotes(), 'tasks' => (object) $this->knowledge->taskNotes()],
            'manager'   => $manager,
            'levels'    => PlannerProfiles::LEVELS,
            'best_times' => Knowledge::BEST_TIMES,
        ];
    }

    /** @return array{summary: string, recommendations: list<array<string, mixed>>, weeks: int} */
    public function strategy(Organization $org, int $weeks, string $lang): array
    {
        $orgId = (int) $org->id;
        $learned = $this->learning->for($orgId, $weeks);
        $facts = [
            'business'  => ['name' => (string) $org->name, 'kind' => (string) $org->resolved_industry] + ($this->knowledge->forAi() ?: []),
            'period'    => ['from' => $learned['from'], 'to' => $learned['to'], 'weeks' => $learned['weeks']],
            'totals'    => $learned['totals'],
            'types'     => array_slice($learned['types'], 0, 25),
            'tasks'     => array_slice($learned['tasks'], 0, 25),
            'people'    => array_map(fn ($p) => array_merge($p, ['types' => array_slice($p['types'], 0, 6)]), $learned['people']),
            'leaders'   => array_slice($learned['leaders'], 0, 15),
            'team'      => array_map(fn ($p) => AiFacts::person($p), $this->team->people()),
            'readiness' => $this->readiness->for($orgId),
        ];
        $answer = $this->ai->coach($orgId, $facts, $lang);

        return [
            'summary'         => $answer['summary'],
            'recommendations' => array_values(array_map(function (array $r) {
                $fix = is_array($r['fix'] ?? null) ? $this->checkedFix($r['fix']) : null;

                return array_filter([
                    'title'  => mb_substr(trim((string) ($r['title'] ?? '')), 0, 160),
                    'detail' => mb_substr(trim((string) ($r['detail'] ?? '')), 0, 600),
                    'kind'   => in_array($r['kind'] ?? null, ['duration', 'training', 'cross_skill', 'schedule', 'recognition', 'process', 'data'], true) ? $r['kind'] : 'process',
                    'impact' => in_array($r['impact'] ?? null, ['high', 'medium', 'low'], true) ? $r['impact'] : 'medium',
                    'fix'    => $fix,
                ], fn ($v) => $v !== null && $v !== '');
            }, array_filter($answer['recommendations'], fn ($r) => trim((string) ($r['title'] ?? '')) !== ''))),
            'weeks'           => $learned['weeks'],
        ];
    }

    /**
     * A fix the planner can make, or null: a typical length for a type or task that exists, or a type a person who has
     * an account and a list of skills does not have yet.
     *
     * @param  array<string, mixed>  $fix
     * @return array<string, mixed>|null
     */
    private function checkedFix(array $fix): ?array
    {
        if (($fix['type'] ?? null) === 'set_typical') {
            $minutes = Knowledge::minutes($fix['minutes'] ?? null);
            if ($minutes === null) {
                return null;
            }
            $key = $this->catalogue->matchChannel(is_string($fix['task_key'] ?? null) ? $fix['task_key'] : null);
            if ($key !== null && !empty($fix['task_key'])) {
                $label = collect($this->catalogue->channels())->firstWhere('key', $key)['label'] ?? $key;

                return ['type' => 'set_typical', 'task_key' => $key, 'label' => $label, 'minutes' => $minutes];
            }
            $group = $this->catalogue->matchGroup(is_string($fix['type_name'] ?? null) ? $fix['type_name'] : null);

            return $group !== null ? ['type' => 'set_typical', 'type_name' => $group, 'label' => $group, 'minutes' => $minutes] : null;
        }
        if (($fix['type'] ?? null) === 'add_skill') {
            $person = is_string($fix['person'] ?? null) ? $this->team->find($fix['person']) : null;
            $group = $this->catalogue->matchGroup(is_string($fix['type_name'] ?? null) ? $fix['type_name'] : null);
            $skills = $person['profile']['skills'] ?? null;
            if (!$person || !$person['has_account'] || !$person['staff_id'] || $group === null || !is_array($skills) || in_array($group, $skills, true)) {
                return null;
            }

            return ['type' => 'add_skill', 'person' => $person['key'], 'name' => $person['name'], 'staff_id' => $person['staff_id'],
                'type_name' => $group, 'label' => $group, 'skills' => array_values(array_merge($skills, [$group]))];
        }

        return null;
    }

    /** @return array<string, mixed> */
    public function draft(Organization $org, string $kind, string $lang): array
    {
        $orgId = (int) $org->id;
        $learned = $this->learning->for($orgId, Learning::WEEKS);
        $shown = $this->experience->byPerson($orgId);
        $people = array_values(array_filter($this->team->people(), fn ($p) => $p['has_account']));
        $facts = match ($kind) {
            'people' => [
                'business' => ['name' => (string) $org->name, 'kind' => (string) $org->resolved_industry],
                'people'   => array_map(function ($p) use ($shown, $learned) {
                    $row = collect($learned['people'])->firstWhere('person', $p['key']);

                    return AiFacts::person($p, $shown[$p['key']] ?? null) + array_filter([
                        'learned' => $row ? ['done' => $row['done'], 'on_time_pct' => $row['on_time_pct'], 'strengths' => $row['strengths'], 'support' => $row['support'], 'types' => array_slice($row['types'], 0, 6)] : null,
                    ]);
                }, $people),
            ],
            'types' => [
                'business' => ['name' => (string) $org->name, 'kind' => (string) $org->resolved_industry],
                'types'    => array_map(fn ($g) => ['type' => $g, 'learned' => collect($learned['types'])->firstWhere('key', $g), 'now' => $this->knowledge->typeNotes()[$g] ?? null], $this->catalogue->groupNames()),
                'tasks'    => array_map(fn ($c) => ['task_key' => $c['key'], 'label' => $c['label'], 'types' => $c['groups'],
                    'learned' => collect($learned['tasks'])->firstWhere('key', $c['key']), 'now' => $this->knowledge->taskNotes()[$c['key']] ?? null], $this->catalogue->channels()),
            ],
            default => [
                'business' => ['name' => (string) $org->name, 'kind' => (string) $org->resolved_industry, 'now' => $this->knowledge->context()],
                'types'    => $this->catalogue->groupNames(),
                'tasks'    => array_map(fn ($c) => $c['label'], $this->catalogue->channels()),
                'team'     => array_map(fn ($p) => array_filter(['job_title' => $p['profile']['job_title'] ?: null, 'manager' => $p['manager'] ?: null, 'skills' => $p['profile']['skills'] ?? 'any']), $people),
                'hours'    => (fn ($w) => WorkWindow::toClock($w['start']) . '-' . WorkWindow::toClock($w['end']))(WorkWindow::resolve()),
            ],
        };
        $raw = $this->ai->draft($orgId, $kind, $facts, $lang);

        if ($kind === 'people') {
            $out = [];
            foreach ((array) ($raw['people'] ?? []) as $d) {
                $p = is_array($d) && is_string($d['person'] ?? null) ? $this->team->find($d['person']) : null;
                if (!$p || !$p['has_account']) {
                    continue;
                }
                $text = fn (string $k, int $max) => mb_substr(trim(is_string($d[$k] ?? null) ? $d[$k] : ''), 0, $max);
                $out[] = ['person' => $p['key'], 'user_id' => $p['user_id'], 'name' => $p['name'],
                    'job_title' => $text('job_title', PlannerProfiles::TITLE_MAX), 'knowledge' => $text('knowledge', PlannerProfiles::KNOWLEDGE_MAX),
                    'strengths' => $text('strengths', PlannerProfiles::NOTE_MAX), 'develop' => $text('develop', PlannerProfiles::NOTE_MAX),
                    'now' => array_intersect_key($p['profile'], array_flip(['job_title', 'knowledge', 'strengths', 'develop']))];
            }

            return ['kind' => 'people', 'people' => $out];
        }
        if ($kind === 'types') {
            $groups = $this->catalogue->groupNames();
            $types = [];
            foreach ((array) ($raw['types'] ?? []) as $d) {
                $g = is_array($d) ? $this->catalogue->matchGroup(is_string($d['type'] ?? null) ? $d['type'] : null) : null;
                if ($g !== null && in_array($g, $groups, true)) {
                    $types[$g] = Knowledge::cleanTypeNotes([$g => $d])[$g] ?? null;
                }
            }
            $labels = collect($this->catalogue->channels())->pluck('label', 'key')->all();
            $tasks = [];
            foreach ((array) ($raw['tasks'] ?? []) as $d) {
                $k = is_array($d) ? $this->catalogue->matchChannel(is_string($d['task_key'] ?? null) ? $d['task_key'] : null) : null;
                if ($k !== null && isset($labels[$k])) {
                    $tasks[$k] = Knowledge::cleanTaskNotes([$k => $d])[$k] ?? null;
                }
            }

            return ['kind' => 'types',
                'types' => array_map(fn ($g, $n) => ['type' => $g] + $n, array_keys(array_filter($types)), array_filter($types)),
                'tasks' => array_map(fn ($k, $n) => ['task_key' => $k, 'label' => $labels[$k]] + $n, array_keys(array_filter($tasks)), array_filter($tasks))];
        }

        return ['kind' => 'business', 'context' => Knowledge::cleanContext($raw)];
    }
}
