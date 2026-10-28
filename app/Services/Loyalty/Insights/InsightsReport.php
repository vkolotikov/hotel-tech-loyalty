<?php

namespace App\Services\Loyalty\Insights;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Services\Appointments\VenueClock;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as Query;
use Illuminate\Support\Facades\DB;

/** Read-only completed-day report. Historical movements and current snapshots are deliberately separate.
 * Population: all current member records in the tenant, optionally on one CURRENT tier, across all places.
 * Activity: a non-reversed positive ledger line (except cancellation refunds/expiry), or a redemption debit.
 * Weekly unique counts are never summed to obtain the period's unique count. All SQL is SQLite/Postgres portable.
 */
final class InsightsReport
{
    public function __construct(private readonly int $orgId, private readonly ?int $tierId = null) {}

    public function get(string $from, string $to, bool $compare): array
    {
        $zone = VenueClock::zone($this->orgId);
        $today = VenueClock::today($this->orgId);
        $period = InsightsPeriod::range($from, $to, $zone);
        $days = InsightsPeriod::daysBetween($from, $to) + 1;
        $previous = $compare ? InsightsPeriod::range(InsightsPeriod::addDays($from, -$days), InsightsPeriod::addDays($from, -1), $zone) : null;
        $current = $this->metrics($period);
        $prior = $previous ? $this->metrics($previous) : null;
        $tiers = LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->orgId)->orderBy('sort_order')->get(['id', 'name']);
        $counts = $this->members()->selectRaw('tier_id, COUNT(*) AS members')->groupBy('tier_id')->pluck('members', 'tier_id');
        $tierRows = $tiers->map(fn ($tier) => ['id' => $tier->id, 'name' => $tier->name, 'members' => (int) ($counts[$tier->id] ?? 0)])->all();
        $known = array_sum(array_column($tierRows, 'members'));
        $expiry = DB::table('point_expiry_buckets')->where(fn ($q) => $q->where('organization_id', $this->orgId)->orWhereNull('organization_id'))
            ->whereIn('member_id', $this->members()->where('is_active', true)->select('id'))
            ->where('is_expired', false)->where('remaining_points', '>', 0)->where('expires_at', '>=', $today)
            ->where('expires_at', '<', InsightsPeriod::addDays($today, 30));
        $quiet = $this->members()->where('is_active', true)->whereNotNull('last_activity_at')
            ->where('last_activity_at', '<', InsightsPeriod::dayStartUtc(InsightsPeriod::addDays($today, -29), $zone))->count();
        $rewardRows = $this->claims($period)->leftJoin('rewards as r', fn ($j) => $j->on('r.id', '=', 'rr.reward_id')->where('r.organization_id', $this->orgId))
            ->selectRaw('rr.reward_id AS id, r.name AS name, COUNT(*) AS claims')->groupBy('rr.reward_id', 'r.name')
            ->orderByDesc('claims')->orderBy('rr.reward_id')->limit(5)->get();

        return [
            'from' => $from, 'to' => $to, 'days' => $days, 'timezone' => $zone, 'updated_at' => now()->toISOString(),
            'snapshot_date' => $today, 'tier_id' => $this->tierId,
            'comparison' => $previous ? ['from' => $previous->from, 'to' => $previous->to] : null,
            'current' => $current, 'previous' => $prior, 'series' => $this->series($period, $current['money']),
            'previous_series' => $previous ? $this->series($previous, $prior['money']) : [],
            'tiers' => ['rows' => $tierRows, 'none' => $this->members()->count() - $known, 'total' => $this->members()->count()],
            'outstanding' => (int) $this->members()->where('is_active', true)->sum('current_points'),
            'rewards' => $rewardRows->map(fn ($r) => ['id' => (int) $r->id, 'name' => $r->name, 'claims' => (int) $r->claims])->all(),
            'cohorts' => $this->cohorts($period),
            'attention' => ['expiring' => (int) (clone $expiry)->sum('remaining_points'), 'expiring_members' => (clone $expiry)->distinct()->count('member_id'),
                'expiry_from' => $today, 'expiry_to' => InsightsPeriod::addDays($today, 29), 'quiet' => $quiet],
        ];
    }

    private function members(): Builder
    {
        return LoyaltyMember::withoutGlobalScopes()->where('organization_id', $this->orgId)
            ->when($this->tierId !== null, fn ($q) => $q->where('tier_id', $this->tierId));
    }

    private function ledger(InsightsPeriod $p): Query
    {
        return DB::table('points_transactions')->where('organization_id', $this->orgId)
            ->whereIn('member_id', $this->members()->select('id'))->where('created_at', '>=', $p->startUtc())->where('created_at', '<', $p->endUtc())
            ->where('is_reversed', false)->whereNull('reversal_of_id')->where(fn ($q) => $q->whereNull('type')->orWhere('type', '<>', 'reverse'));
    }

    private function activity(InsightsPeriod $p): Query
    {
        return $this->ledger($p)->where(fn ($q) => $q->where(fn ($w) => $w->where('points', '>', 0)
            ->where(fn ($w) => $w->whereNull('type')->orWhereNotIn('type', ['expire', 'redeem']))
            ->whereRaw("NOT (COALESCE(type, '') = 'adjust' AND COALESCE(description, '') LIKE ?)", [LoyaltyInsights::REFUND_PREFIX . '%']))
            ->orWhere(fn ($w) => $w->where('type', 'redeem')->where('points', '<', 0)));
    }

    private function joined(InsightsPeriod $p): Builder
    {
        return $this->members()->whereRaw('COALESCE(joined_at, created_at) >= ? AND COALESCE(joined_at, created_at) < ?', [$p->startUtc(), $p->endUtc()]);
    }

    private function claims(InsightsPeriod $p): Query
    {
        // Redemptions belong to the tenant through their member, and also carry organization_id.
        return DB::table('reward_redemptions as rr')->where(fn ($q) => $q->where('rr.organization_id', $this->orgId)->orWhereNull('rr.organization_id'))
            ->whereIn('rr.member_id', $this->members()->select('id'))->where('rr.created_at', '>=', $p->startUtc())->where('rr.created_at', '<', $p->endUtc());
    }

    private function metrics(InsightsPeriod $p): array
    {
        $members = $this->members()->whereRaw('COALESCE(joined_at, created_at) < ?', [$p->endUtc()])->count();
        $active = $this->activity($p)->distinct()->count('member_id');
        $issued = $redeemed = $expired = 0;
        foreach ($this->ledger($p)->select('type', 'points', 'description')->cursor() as $line) {
            $n = (int) $line->points;
            if ($line->type === 'adjust' && $n > 0 && str_starts_with($line->description ?? '', LoyaltyInsights::REFUND_PREFIX)) $redeemed -= $n;
            elseif ($line->type === 'redeem') $redeemed += abs($n);
            elseif ($line->type === 'expire') $expired += abs($n);
            elseif ($n > 0) $issued += $n;
        }
        $states = $this->claims($p)->selectRaw('rr.status, COUNT(*) AS n')->groupBy('rr.status')->pluck('n', 'status');
        $claims = (int) $states->sum();
        $fulfilled = (int) ($states['fulfilled'] ?? 0);
        return ['members' => $members, 'active' => $active, 'new_members' => $this->joined($p)->count(),
            'participation' => $members ? round($active / $members * 100, 1) : null,
            'issued' => $issued, 'redeemed' => $redeemed, 'expired' => $expired, 'claims' => $claims,
            'fulfilled' => $fulfilled, 'pending' => (int) ($states['pending'] ?? 0), 'cancelled' => (int) ($states['cancelled'] ?? 0),
            'fulfilment' => $claims ? round($fulfilled / $claims * 100, 1) : null,
            'money' => InsightsMoney::for($this->orgId, '30d', $p, $this->tierId)];
    }

    private function week(InsightsPeriod $p, string $start): InsightsPeriod
    {
        return InsightsPeriod::range($start, min($p->to, InsightsPeriod::addDays($start, 6)), VenueClock::zone($this->orgId));
    }

    private function series(InsightsPeriod $p, array $money): array
    {
        return array_map(function (string $key, int $i) use ($p, $money) {
            $week = $this->week($p, $key);
            return ['from' => $key, 'to' => $week->to, 'active' => $this->activity($week)->distinct()->count('member_id'),
                'sales' => round($money['series'][$i]['stays'] + $money['series'][$i]['services'], 2)];
        }, $p->keys, array_keys($p->keys));
    }

    private function cohorts(InsightsPeriod $p): array
    {
        return array_map(function (string $key) use ($p) {
            $week = $this->week($p, $key);
            $joined = $this->joined($week);
            $returns = [];
            foreach ([1, 2, 3] as $offset) {
                $from = InsightsPeriod::addDays($key, 7 * $offset);
                $to = InsightsPeriod::addDays($from, 6);
                $returns[] = $to > $p->to ? null : $this->activity($this->week($p, $from))->whereIn('member_id', (clone $joined)->select('id'))->distinct()->count('member_id');
            }
            return ['from' => $key, 'to' => $week->to, 'members' => $joined->count(), 'returns' => $returns];
        }, $p->keys);
    }
}
