<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Scopes\TenantScope;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

/**
 * Translates a member-segment definition into a query builder.
 *
 * Definition format:
 * {
 *   "operator": "AND" | "OR",          // default AND
 *   "filters": [
 *     {"type": "tier",            "op": "in",            "value": [tierId, ...]},
 *     {"type": "tier",            "op": "not_in",        "value": [tierId, ...]},
 *     {"type": "activity",        "op": "active_within", "value": <days>},
 *     {"type": "activity",        "op": "inactive_over", "value": <days>},
 *     {"type": "current_points",  "op": "min",           "value": <int>},
 *     {"type": "current_points",  "op": "max",           "value": <int>},
 *     {"type": "lifetime_points", "op": "min",           "value": <int>},
 *     {"type": "lifetime_points", "op": "max",           "value": <int>},
 *     {"type": "joined",          "op": "after",         "value": "YYYY-MM-DD"},
 *     {"type": "joined",          "op": "before",        "value": "YYYY-MM-DD"},
 *     {"type": "redemptions",     "op": "any"},          // has ≥1 reward redemption
 *     {"type": "redemptions",     "op": "none"},
 *     {"type": "earn",            "op": "any"},          // has ≥1 earn transaction
 *     {"type": "earn",            "op": "none"}
 *   ]
 * }
 *
 * Operator defaults to AND. Unknown filter types are ignored
 * silently so a future-field added in the UI before the server
 * recognises it doesn't blow up the whole evaluation.
 *
 * All queries assume tenant context is already bound; the caller
 * (controller) wraps the request in the org middleware so the
 * global scope filters correctly.
 */
class MemberSegmentService
{
    public function buildQuery(array $definition): Builder
    {
        $operator = strtoupper((string) ($definition['operator'] ?? 'AND'));
        $filters  = is_array($definition['filters'] ?? null) ? $definition['filters'] : [];

        // Always scope to active members — soft-deactivated rows are
        // not a useful campaign target and would confuse the count.
        $q = LoyaltyMember::query()->where('is_active', true);

        if (empty($filters)) return $q;

        $apply = function (Builder $inner) use ($filters) {
            foreach ($filters as $f) {
                $this->applyFilter($inner, $f);
            }
        };

        // For OR we need a single wheres-group. For AND we attach
        // directly so the global scope's WHERE chains naturally.
        if ($operator === 'OR') {
            $q->where(function (Builder $inner) use ($filters) {
                foreach ($filters as $f) {
                    $inner->orWhere(function (Builder $sub) use ($f) {
                        $this->applyFilter($sub, $f);
                    });
                }
            });
        } else {
            $apply($q);
        }

        return $q;
    }

    public function count(array $definition): int
    {
        return $this->buildQuery($definition)->count();
    }

    /**
     * @return int[]  Member ids matching the definition. Hard-capped
     * at 5000 so a runaway "everybody" segment can't OOM the bulk-
     * message endpoint that consumes this.
     */
    public function memberIds(array $definition, int $max = 5000): array
    {
        return $this->buildQuery($definition)
            ->limit($max)
            ->pluck('id')
            ->all();
    }

    private function applyFilter(Builder $q, array $f): void
    {
        $type  = $f['type'] ?? null;
        $op    = $f['op']   ?? null;
        $value = $f['value'] ?? null;

        switch ($type) {
            case 'tier':
                $ids = array_values(array_filter((array) $value, fn ($v) => is_numeric($v)));
                if (empty($ids)) return;
                $op === 'not_in' ? $q->whereNotIn('tier_id', $ids) : $q->whereIn('tier_id', $ids);
                return;

            case 'activity':
                $days = (int) $value;
                if ($days <= 0) return;
                if ($op === 'active_within') {
                    $q->where('last_activity_at', '>=', Carbon::now()->subDays($days));
                } elseif ($op === 'inactive_over') {
                    $q->where(function (Builder $sub) use ($days) {
                        $sub->whereNull('last_activity_at')
                            ->orWhere('last_activity_at', '<', Carbon::now()->subDays($days));
                    });
                }
                return;

            case 'current_points':
                $n = (int) $value;
                if ($op === 'min') $q->where('current_points', '>=', $n);
                elseif ($op === 'max') $q->where('current_points', '<=', $n);
                return;

            case 'lifetime_points':
                $n = (int) $value;
                if ($op === 'min') $q->where('lifetime_points', '>=', $n);
                elseif ($op === 'max') $q->where('lifetime_points', '<=', $n);
                return;

            case 'joined':
                try {
                    $d = Carbon::parse((string) $value);
                } catch (\Throwable $e) {
                    return;
                }
                $op === 'before' ? $q->where('joined_at', '<', $d) : $q->where('joined_at', '>=', $d);
                return;

            case 'redemptions':
                if ($op === 'any') {
                    $q->whereExists(function ($sub) {
                        $sub->select(\DB::raw(1))
                            ->from('reward_redemptions')
                            ->whereColumn('reward_redemptions.member_id', 'loyalty_members.id');
                    });
                } elseif ($op === 'none') {
                    $q->whereNotExists(function ($sub) {
                        $sub->select(\DB::raw(1))
                            ->from('reward_redemptions')
                            ->whereColumn('reward_redemptions.member_id', 'loyalty_members.id');
                    });
                }
                return;

            case 'earn':
                if ($op === 'any') {
                    $q->whereExists(function ($sub) {
                        $sub->select(\DB::raw(1))
                            ->from('points_transactions')
                            ->whereColumn('points_transactions.member_id', 'loyalty_members.id')
                            ->where('points', '>', 0);
                    });
                } elseif ($op === 'none') {
                    $q->whereNotExists(function ($sub) {
                        $sub->select(\DB::raw(1))
                            ->from('points_transactions')
                            ->whereColumn('points_transactions.member_id', 'loyalty_members.id')
                            ->where('points', '>', 0);
                    });
                }
                return;

            default:
                // Unknown filter type — skip silently so an unrecognised
                // future field doesn't kill the whole evaluation.
                return;
        }
    }
}
