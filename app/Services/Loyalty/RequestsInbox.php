<?php

namespace App\Services\Loyalty;

use App\Models\BenefitEntitlement;
use App\Models\LoyaltyMember;
use App\Models\Referral;
use App\Models\RewardRedemption;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/** Read-only cross-source index. Native IDs, states and writers remain separate. */
final class RequestsInbox
{
    private const SOURCES = [
        'benefit' => [BenefitEntitlement::class, ['pending', 'eligible', 'approved']],
        'redemption' => [RewardRedemption::class, ['pending']],
        'referral' => [Referral::class, ['pending', 'qualified']],
    ];

    public function page(array $filters): array
    {
        $parts = [];
        foreach (self::SOURCES as $kind => [$model, $open]) {
            if (($filters['type'] ?? 'all') !== 'all' && $filters['type'] !== $kind) continue;
            $query = $model::query();
            $view = $filters['view'] ?? 'open';
            if ($view === 'open') $query->whereIn('status', $open);
            elseif ($view === 'closed') $query->whereNotIn('status', $open);
            elseif ($view === 'waiting') $query->whereIn('status', $kind === 'benefit' ? RequestQueue::WAITING : []);
            elseif ($view === 'approved') $query->whereIn('status', $kind === 'benefit' ? ['approved'] : []);
            $this->search($query, $kind, trim($filters['q'] ?? ''));
            $at = $kind === 'benefit' ? 'COALESCE(requested_at, created_at)' : 'created_at';
            // toBase applies each model's tenant scope before UNION. The global sort/count/page are SQL-side.
            $parts[] = $query->select('id')->selectRaw("'{$kind}' AS kind, {$at} AS at")->toBase();
        }
        $union = array_shift($parts);
        foreach ($parts as $part) $union->unionAll($part);
        $index = DB::query()->fromSub($union, 'inbox');
        $total = (clone $index)->count();
        $perPage = (int) ($filters['per_page'] ?? 5);
        $pages = max(1, (int) ceil($total / $perPage));
        $page = min(max(1, (int) ($filters['page'] ?? 1)), $pages);
        $direction = ($filters['sort'] ?? 'newest') === 'oldest' ? 'asc' : 'desc';
        $keys = $index->orderBy('at', $direction)->orderBy('kind')->orderBy('id', $direction)->forPage($page, $perPage)->get();
        $rows = [];
        foreach (self::SOURCES as $kind => [$model]) {
            $ids = $keys->where('kind', $kind)->pluck('id')->all();
            if (!$ids) continue;
            foreach ($this->withDetails($model::query(), $kind)->whereKey($ids)->get() as $row) {
                $rows[$kind.':'.$row->id] = $this->row($kind, $row);
            }
        }
        $selected = null;
        if (isset($filters['selected_kind'], $filters['selected_id'])) {
            $kind = $filters['selected_kind'];
            $model = self::SOURCES[$kind][0];
            $row = $this->withDetails($model::query(), $kind)->find($filters['selected_id']);
            if (!$row) throw LoyaltyRefused::notFound();
            $selected = $this->row($kind, $row);
        }
        return [
            'records' => $keys->map(fn ($key) => $rows[$key->kind.':'.$key->id] ?? null)->filter()->values()->all(),
            'selected' => $selected, 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => $perPage,
        ];
    }

    private function search(Builder $query, string $kind, string $term): void
    {
        if ($term === '') return;
        $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($term)).'%';
        $prefix = ['benefit' => 'BR', 'redemption' => 'RR', 'referral' => 'RF'][$kind];
        $id = preg_match('/^#?(?:'.$prefix.'-)?([0-9]+)$/i', $term, $match) ? (int) $match[1] : null;
        $query->where(function (Builder $q) use ($kind, $like, $id) {
            $q->whereRaw('1 = 0');
            if ($id !== null) $q->orWhere($q->getModel()->getQualifiedKeyName(), $id);
            foreach ($kind === 'referral' ? ['referrer', 'referee'] : ['member'] as $relation) {
                $q->orWhereHas($relation, fn (Builder $m) => $m->where(function (Builder $person) use ($like) {
                    $person->whereRaw("LOWER(member_number) LIKE ? ESCAPE '!'", [$like])
                        ->orWhereHas('user', fn (Builder $u) => $u->whereRaw("LOWER(name) LIKE ? ESCAPE '!'", [$like]));
                }));
            }
            if ($kind !== 'referral') $q->orWhereHas($kind === 'benefit' ? 'benefit' : 'reward', fn (Builder $item) => $item->whereRaw("LOWER(name) LIKE ? ESCAPE '!'", [$like]));
            if ($kind === 'redemption') $q->orWhereRaw("LOWER(code) LIKE ? ESCAPE '!'", [$like]);
        });
    }

    private function withDetails(Builder $query, string $kind): Builder
    {
        return $query->with($kind === 'referral'
            ? ['referrer.user:id,name', 'referrer.tier:id,name', 'referee.user:id,name', 'referee.tier:id,name']
            : ['member.user:id,name', 'member.tier:id,name', $kind === 'benefit' ? 'benefit:id,name' : 'reward:id,name']);
    }

    private function member(?LoyaltyMember $member): ?array
    {
        return $member ? ['id' => (int) $member->id, 'name' => (string) ($member->user?->name ?? ''),
            'number' => $member->member_number, 'tier' => $member->tier?->name] : null;
    }

    private function row(string $kind, BenefitEntitlement|RewardRedemption|Referral $row): array
    {
        $result = ['key' => $kind.':'.$row->id, 'kind' => $kind, 'id' => (int) $row->id, 'state' => (string) $row->status,
            'at' => ($kind === 'benefit' ? ($row->requested_at ?? $row->created_at) : $row->created_at)?->toIso8601String()];
        if ($row instanceof Referral) return $result + [
            'member' => $this->member($row->referrer), 'referee' => $this->member($row->referee),
            'points' => ['referrer' => (int) $row->referrer_points_awarded, 'referee' => (int) $row->referee_points_awarded],
            'qualified_at' => $row->qualified_at?->toIso8601String(), 'rewarded_at' => $row->rewarded_at?->toIso8601String(),
        ];
        $result += ['member' => $this->member($row->member), 'title' => $row instanceof BenefitEntitlement ? $row->benefit?->name : $row->reward?->name,
            'fulfilled_at' => $row->fulfilled_at?->toIso8601String()];
        return $row instanceof BenefitEntitlement
            ? $result + ['decline_reason' => $row->decline_reason]
            : $result + ['code' => (string) $row->code, 'points' => (int) $row->points_spent, 'cancelled_at' => $row->cancelled_at?->toIso8601String()];
    }
}
