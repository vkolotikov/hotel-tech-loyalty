<?php

namespace App\Services\Loyalty\Campaigns;

use App\Models\LoyaltyTier;
use App\Services\Loyalty\LoyaltyRefused;

/**
 * What a segment's rules may say in HexaTech Loyalty (spec 2026-10-21 release 2 §6), in MemberSegmentService's own
 * format — `{operator: AND|OR, filters: [{type, op, value}]}` — so the full admin's segments and campaigns read the
 * workspace's segments as they read their own.
 *
 * The shared service fails open: a rule it does not understand (an unknown type or operator, an empty value, a tier
 * list with nothing numeric in it) is skipped, and a segment whose every rule is skipped matches every active member.
 * Here a segment never matches everyone by accident: every rule needs a known type, an operator its type has and a
 * value inside the bounds below (a tier must be this organisation's), or the whole segment is refused (`bad_rule`
 * with the rule's index and the reason). "Everyone" is a choice of its own, saved as no rules; no rules without that
 * choice is refused too. The same check reads a stored definition (one the full admin saved), so a campaign is never
 * sent to a segment the shared service would widen.
 */
final class SegmentRules
{
    public const OPERATORS = ['AND', 'OR'];
    public const MAX_RULES = 20;
    public const MAX_TIERS = 50;
    public const MAX_DAYS = 3650;
    public const MAX_POINTS = 10_000_000;
    public const FIRST_DAY = '1990-01-01';
    public const LAST_DAY = '2100-12-31';

    /**
     * Every rule type the shared service evaluates, the operators it reads for each, and what its value is: tiers
     * (this organisation's ids), days (activity), points (a balance), a date (joined) or none (redemptions, earn).
     */
    public const TYPES = [
        'tier'            => ['ops' => ['in', 'not_in'], 'value' => 'tiers'],
        'activity'        => ['ops' => ['active_within', 'inactive_over'], 'value' => 'days'],
        'current_points'  => ['ops' => ['min', 'max'], 'value' => 'points'],
        'lifetime_points' => ['ops' => ['min', 'max'], 'value' => 'points'],
        'joined'          => ['ops' => ['after', 'before'], 'value' => 'date'],
        'redemptions'     => ['ops' => ['any', 'none'], 'value' => 'none'],
        'earn'            => ['ops' => ['any', 'none'], 'value' => 'none'],
    ];

    /**
     * The editor's choices (`GET segments/options`): the types with their operators and bounds, and this
     * organisation's tiers. The workspace keeps no copy of any of it.
     *
     * @return array<string, mixed>
     */
    public static function options(): array
    {
        $bounds = [
            'tiers'  => ['max' => self::MAX_TIERS],
            'days'   => ['min' => 1, 'max' => self::MAX_DAYS],
            'points' => ['min' => 0, 'max' => self::MAX_POINTS],
            'date'   => ['min' => self::FIRST_DAY, 'max' => self::LAST_DAY],
            'none'   => [],
        ];

        return [
            'operators' => self::OPERATORS,
            'max_rules' => self::MAX_RULES,
            'types'     => array_map(
                fn (string $type, array $rule) => ['type' => $type, 'ops' => $rule['ops'], 'value' => $rule['value']] + $bounds[$rule['value']],
                array_keys(self::TYPES), self::TYPES,
            ),
            'tiers'     => LoyaltyTier::query()->orderBy('sort_order')->orderBy('min_points')->get()
                ->map(fn (LoyaltyTier $t) => ['id' => (int) $t->id, 'name' => (string) $t->name, 'color' => $t->color_hex, 'is_active' => (bool) $t->is_active])
                ->values()->all(),
        ];
    }

    /**
     * The definition to store for what a request sent, or a refusal: `everyone` true with no rules is the explicit
     * "Everyone" (saved as no rules); otherwise one rule at least, every one of them sound. The stored rules are
     * written back in one canonical shape (integers as integers, no value for redemptions and earn).
     *
     * @return array{operator: string, filters: list<array<string, mixed>>}
     * @throws LoyaltyRefused `bad_rule` (422) with `index` (null for the segment as a whole) and `reason`
     */
    public static function fromRequest(bool $everyone, mixed $operator, mixed $filters): array
    {
        $filters ??= [];
        if (!is_array($filters) || !array_is_list($filters)) {
            throw self::refused(null, 'bad_rules');
        }
        if ($everyone) {
            if ($filters !== []) {
                throw self::refused(null, 'everyone_with_rules');
            }

            return ['operator' => 'AND', 'filters' => []];
        }
        // No rules is "Everyone" only when chosen as such; an AND or an OR of nothing never is.
        if ($filters === []) {
            throw self::refused(null, 'no_rules');
        }
        if (!in_array($operator, self::OPERATORS, true)) {
            throw self::refused(null, 'operator');
        }
        [$rules, $problem] = self::read($filters);
        if ($problem !== null) {
            throw self::refused($problem['index'], $problem['reason']);
        }

        return ['operator' => $operator, 'filters' => $rules];
    }

    /**
     * The first problem of a stored definition, or null when the workspace would have saved it as it is. No rules at
     * all reads as the explicit "Everyone" (how the workspace saves it; the full admin cannot save an empty list).
     *
     * @return array{index: int|null, reason: string}|null
     */
    public static function problem(mixed $definition): ?array
    {
        if (!is_array($definition)) {
            return ['index' => null, 'reason' => 'bad_rules'];
        }
        $filters = $definition['filters'] ?? null;
        if (!is_array($filters) || !array_is_list($filters)) {
            return ['index' => null, 'reason' => 'bad_rules'];
        }
        if ($filters === []) {
            return null;
        }
        // The shared service reads a missing operator as AND, and anything but OR as AND too.
        $operator = $definition['operator'] ?? 'AND';
        if (!in_array(is_string($operator) ? strtoupper($operator) : $operator, self::OPERATORS, true)) {
            return ['index' => null, 'reason' => 'operator'];
        }

        return self::read($filters)[1];
    }

    /** Whether a stored definition is the explicit "Everyone" (no rules). */
    public static function isEveryone(mixed $definition): bool
    {
        return is_array($definition) && ($definition['filters'] ?? null) === [];
    }

    /** @throws LoyaltyRefused `bad_rule` when the stored definition has a problem (the send's and the audience's check) */
    public static function assertSound(mixed $definition): void
    {
        $problem = self::problem($definition);
        if ($problem !== null) {
            throw self::refused($problem['index'], $problem['reason']);
        }
    }

    /**
     * Every rule read, in order, and the first problem.
     *
     * @param list<mixed> $filters
     * @return array{0: list<array<string, mixed>>, 1: array{index: int|null, reason: string}|null}
     */
    private static function read(array $filters): array
    {
        if (count($filters) > self::MAX_RULES) {
            return [[], ['index' => null, 'reason' => 'too_many']];
        }
        $tiers = null;
        $out = [];
        foreach ($filters as $i => $rule) {
            if (!is_array($rule)) {
                return [[], ['index' => $i, 'reason' => 'unknown_type']];
            }
            $type = $rule['type'] ?? null;
            if (!is_string($type) || !isset(self::TYPES[$type])) {
                return [[], ['index' => $i, 'reason' => 'unknown_type']];
            }
            $op = $rule['op'] ?? null;
            if (!in_array($op, self::TYPES[$type]['ops'], true)) {
                return [[], ['index' => $i, 'reason' => 'unknown_op']];
            }
            $value = $rule['value'] ?? null;
            $kind = self::TYPES[$type]['value'];
            if ($kind !== 'none' && ($value === null || $value === '' || $value === [])) {
                return [[], ['index' => $i, 'reason' => 'no_value']];
            }

            switch ($kind) {
                case 'tiers':
                    if (!is_array($value) || !array_is_list($value)) {
                        return [[], ['index' => $i, 'reason' => 'bad_value']];
                    }
                    $ids = [];
                    foreach ($value as $id) {
                        $n = self::whole($id);
                        if ($n === null || $n < 1) {
                            return [[], ['index' => $i, 'reason' => 'bad_value']];
                        }
                        $ids[$n] = $n;
                    }
                    if (count($ids) > self::MAX_TIERS) {
                        return [[], ['index' => $i, 'reason' => 'too_many_tiers']];
                    }
                    // Tenant-scoped: another organisation's tier is not one of these.
                    $tiers ??= LoyaltyTier::query()->pluck('id')->map(fn ($id) => (int) $id)->all();
                    if (array_diff($ids, $tiers) !== []) {
                        return [[], ['index' => $i, 'reason' => 'unknown_tier']];
                    }
                    sort($ids);
                    $out[] = ['type' => $type, 'op' => $op, 'value' => array_values($ids)];
                    break;

                case 'days':
                case 'points':
                    $n = self::whole($value);
                    [$min, $max] = $kind === 'days' ? [1, self::MAX_DAYS] : [0, self::MAX_POINTS];
                    if ($n === null) {
                        return [[], ['index' => $i, 'reason' => 'bad_value']];
                    }
                    if ($n < $min || $n > $max) {
                        return [[], ['index' => $i, 'reason' => 'out_of_range']];
                    }
                    $out[] = ['type' => $type, 'op' => $op, 'value' => $n];
                    break;

                case 'date':
                    if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
                        return [[], ['index' => $i, 'reason' => 'bad_value']];
                    }
                    if ($value < self::FIRST_DAY || $value > self::LAST_DAY) {
                        return [[], ['index' => $i, 'reason' => 'out_of_range']];
                    }
                    $out[] = ['type' => $type, 'op' => $op, 'value' => $value];
                    break;

                default:
                    // Redemptions and earn take no value; the full admin's editor leaves an empty one behind.
                    if ($value !== null && $value !== '') {
                        return [[], ['index' => $i, 'reason' => 'bad_value']];
                    }
                    $out[] = ['type' => $type, 'op' => $op];
            }
        }

        return [$out, null];
    }

    /** A whole number given as an integer or as its digits ("30", which the full admin may have stored), else null. */
    private static function whole(mixed $value): ?int
    {
        if (is_int($value)) {
            return $value;
        }
        if (is_string($value) && preg_match('/^\d{1,9}$/', $value)) {
            return (int) $value;
        }

        return null;
    }

    private static function refused(?int $index, string $reason): LoyaltyRefused
    {
        return new LoyaltyRefused('bad_rule', 'This segment has a rule that cannot be used.', 422, ['index' => $index, 'reason' => $reason]);
    }
}
