<?php

namespace App\Services\Loyalty\Programme;

use App\Services\LoyaltyService;

/**
 * Program's checks (release 10, the owner's Figma 163:88: "Several tiers share the same starting points … Review
 * rules"): the tier ladder and the benefit catalogue read together, so a manager is told what members will never get.
 * Reads only; the workspace names each code and draws it.
 *
 * - `tiers_share_threshold` (warn): two or more tiers members reach by earning start at the same figure on the
 *   programme's measure (`tier_progress_by`). LoyaltyService picks one tier per figure (the highest floor reached, the
 *   first in the ladder's order among equals), so the others are never reached by earning. One item per shared figure,
 *   with its tiers in the ladder's order. A switched-off tier, an invitation-only tier and a tier with no floor on the
 *   measure are not on that ladder, so they never count.
 * - `benefit_unused` (tip): benefits switched on that no tier in use gives, so no member has them. One item, every such
 *   benefit in the catalogue's order.
 */
final class TierAdvice
{
    /**
     * @param list<array{id: int, name: string, is_active: bool, invitation_only: bool, min_points: int|float|null, min_visits: int|float|null, min_spend: int|float|null}> $tiers in the ladder's order
     * @param list<array{id: int, name: string, is_active: bool}> $benefits in the catalogue's order
     * @param array<int, list<int>> $givenBy benefit id => the tiers that give it (their active tier benefits)
     * @return list<array{code: string, level: string, params: array<string, int|float>, tiers: list<array{id: int, name: string}>, benefits: list<array{id: int, name: string}>}>
     */
    public static function read(array $tiers, array $benefits, array $givenBy, string $progressBy): array
    {
        $column = LoyaltyService::FLOOR_COLUMNS[$progressBy] ?? 'min_points';
        $advice = [];

        $onLadder = array_values(array_filter($tiers, fn (array $t) => $t['is_active'] && !$t['invitation_only'] && $t[$column] !== null));
        $byFloor = [];
        foreach ($onLadder as $tier) {
            // Floors compare as numbers (a spend floor is decimal): 0 and 0.0 are the same figure.
            $byFloor[(string) (float) $tier[$column]][] = $tier;
        }
        foreach ($byFloor as $floor => $same) {
            if (count($same) < 2) {
                continue;
            }
            $advice[] = [
                'code'     => 'tiers_share_threshold',
                'level'    => ProgrammeAdvice::WARN,
                'params'   => ['value' => (float) $floor == (int) $floor ? (int) $floor : (float) $floor],
                'tiers'    => array_map(fn (array $t) => ['id' => $t['id'], 'name' => $t['name']], $same),
                'benefits' => [],
            ];
        }

        $inUse = array_column(array_filter($tiers, fn (array $t) => $t['is_active']), 'id');
        $unused = array_values(array_filter($benefits, fn (array $b) => $b['is_active']
            && array_intersect($givenBy[$b['id']] ?? [], $inUse) === []));
        if ($unused !== []) {
            $advice[] = [
                'code'     => 'benefit_unused',
                'level'    => ProgrammeAdvice::TIP,
                'params'   => ['n' => count($unused)],
                'tiers'    => [],
                'benefits' => array_map(fn (array $b) => ['id' => $b['id'], 'name' => $b['name']], $unused),
            ];
        }

        return $advice;
    }
}
