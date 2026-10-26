<?php

namespace App\Services\Loyalty\Setup;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Reward;
use App\Models\ScanEvent;
use App\Services\Loyalty\AppLook;
use App\Services\Loyalty\Programme\ProgrammeAdvice;
use App\Services\Loyalty\Programme\ProgrammeOptions;

/**
 * "Start here" (release 10, owner 2026-10-26: "users could go inside the app without any knowledge … understand all
 * the configuration"): the steps that set a programme up, in order, each done or not as the venue stands now. Reads
 * only; each step is a fact the workspace already shows elsewhere, so the list ticks itself as staff work:
 *
 * - `programme`: the setup wizard was applied or skipped (`programme_setup_completed_at`);
 * - `tiers`: a tier is switched on;
 * - `ways`: Ways to earn's checks find nothing to fix (ProgrammeAdvice's warnings; tips do not hold it back);
 * - `rewards`: a reward is offered;
 * - `logo`: the member app and card carry the venue's logo (AppLook);
 * - `member`: the programme has a member;
 * - `scan`: a card was scanned at the desk once.
 *
 * `count` is what each step counts (for `ways`, the warnings still open).
 */
final class SetupProgress
{
    public const STEPS = ['programme', 'tiers', 'ways', 'rewards', 'logo', 'member', 'scan'];

    public function __construct(private readonly ProgrammeAdvice $advice)
    {
    }

    /** @return array{steps: list<array{key: string, done: bool, count: int}>, done: int, total: int} */
    public function for(int $orgId): array
    {
        $options = ProgrammeOptions::for($orgId);
        $rewardIds = Reward::query()->where('is_active', true)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $warnings = count(array_filter(
            $this->advice->for($orgId, $options, $rewardIds)['advice'],
            fn (array $a) => $a['level'] === ProgrammeAdvice::WARN,
        ));

        return self::read([
            'programme' => $options['programme_setup_completed_at'] !== null ? 1 : 0,
            'tiers'     => LoyaltyTier::query()->where('is_active', true)->count(),
            'ways'      => $warnings,
            'rewards'   => count($rewardIds),
            'logo'      => AppLook::read()['logo_url'] !== null ? 1 : 0,
            'member'    => LoyaltyMember::query()->count(),
            'scan'      => ScanEvent::query()->count(),
        ]);
    }

    /**
     * The steps from their counts: each done when it counts something — `ways` when it counts nothing (no warning left).
     *
     * @param array<string, int> $counts
     * @return array{steps: list<array{key: string, done: bool, count: int}>, done: int, total: int}
     */
    public static function read(array $counts): array
    {
        $steps = array_map(fn (string $key) => [
            'key'   => $key,
            'done'  => $key === 'ways' ? ($counts[$key] ?? 0) === 0 : ($counts[$key] ?? 0) > 0,
            'count' => (int) ($counts[$key] ?? 0),
        ], self::STEPS);

        return [
            'steps' => $steps,
            'done'  => count(array_filter($steps, fn (array $s) => $s['done'])),
            'total' => count($steps),
        ];
    }
}
