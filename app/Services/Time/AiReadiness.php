<?php

namespace App\Services\Time;

/**
 * How much the planner's AI has to go by (HexaTech Time Planner, 2026-11-14): what a manager has taught it (Knowledge,
 * PlannerProfiles) and how much history it can learn from (Learning). Each item says how far along it is (0–100) and,
 * where it counts things, how many of how many; `score` is their average. The workspace shows it as a checklist with a
 * way to each gap, and the coach's AI reads it to say what to fill in first. Reads only.
 */
final class AiReadiness
{
    /** Finished tasks in the learning window from which the figures start to mean something. */
    public const HISTORY_ENOUGH = 20;

    /** Share of finished tasks with clocked time from which real lengths can be learned. */
    public const CLOCKED_ENOUGH = 30;

    public function __construct(
        private readonly Team $team,
        private readonly Knowledge $knowledge,
        private readonly Learning $learning,
        private readonly PlannerCatalogue $catalogue,
    ) {
    }

    /** @return array{score: int, items: list<array{code: string, pct: int, count: ?int, total: ?int}>} */
    public function for(int $orgId): array
    {
        $context = $this->knowledge->context();
        $typeNotes = $this->knowledge->typeNotes();
        $types = $this->catalogue->groupNames();
        $people = array_values(array_filter($this->team->people(), fn ($p) => $p['has_account']));
        $staff = array_values(array_filter($people, fn ($p) => !$p['manager']));
        $learned = $this->learning->for($orgId);

        $count = fn (array $list, callable $ok) => count(array_filter($list, $ok));
        $items = [];
        $items[] = self::item('about', $context['about'] !== '' ? 1 : 0, 1, false);
        $items[] = self::item('rules', $context['rules'] !== '' ? 1 : 0, 1, false);
        $items[] = self::item('types', $count($types, fn ($t) => isset($typeNotes[$t])), count($types));
        $items[] = self::item('people', $count($people, fn ($p) => trim($p['profile']['knowledge']) !== '' || $p['profile']['job_title'] !== ''), count($people));
        $items[] = self::item('skills', $count($staff, fn ($p) => $p['profile']['skills'] !== null), count($staff));
        $items[] = self::item('hours', $count($people, fn ($p) => $p['profile']['work_start'] !== null || $p['profile']['work_days'] !== null), count($people));
        $items[] = self::item('history', min($learned['totals']['done'], self::HISTORY_ENOUGH), self::HISTORY_ENOUGH, true, $learned['totals']['done']);
        $clockedPct = (int) ($learned['totals']['clocked_pct'] ?? 0);
        $items[] = ['code' => 'clocked', 'pct' => (int) min(100, round($clockedPct / self::CLOCKED_ENOUGH * 100)), 'count' => $clockedPct, 'total' => 100];

        return ['score' => (int) round(array_sum(array_column($items, 'pct')) / count($items)), 'items' => $items];
    }

    /** @return array{code: string, pct: int, count: ?int, total: ?int} */
    private static function item(string $code, int $have, int $of, bool $counted = true, ?int $shown = null): array
    {
        return [
            'code'  => $code,
            // Nothing to count (no types, no staff) is nothing missing.
            'pct'   => $of > 0 ? (int) round(min($have, $of) / $of * 100) : 100,
            'count' => $counted ? ($shown ?? $have) : null,
            'total' => $counted ? $of : null,
        ];
    }
}
