<?php

namespace App\Services\Loyalty\Overview;

use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\MemberOffer;
use App\Models\PointsTransaction;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Models\SpecialOffer;
use App\Models\TierBenefit;
use App\Models\TierAssessment;
use App\Models\User;
use App\Services\Loyalty\AppLook;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\Programme\ProgrammeAdvice;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Programme\TierAdvice;
use App\Services\Loyalty\RequestQueue;
use App\Services\Loyalty\Setup\SetupProgress;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Read-only Overview adapter. All model scopes remain in force; child reads are anchored to scoped members. */
class OverviewRead
{
    public function __construct(private readonly ProgrammeAdvice $advice, private readonly SetupProgress $setup) {}

    private function members(int $orgId)
    {
        return LoyaltyMember::query()->where('loyalty_members.organization_id', $orgId);
    }

    private function rewards(int $orgId)
    {
        return Reward::query()->where('organization_id', $orgId)->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()))
            ->where(fn ($q) => $q->whereNull('stock')->orWhere('stock', '>', 0));
    }

    private function offers(int $orgId, string $today)
    {
        return SpecialOffer::query()->where('organization_id', $orgId)->where('is_active', true)
            ->where('start_date', '<=', $today)->where('end_date', '>=', $today)
            ->where(fn ($q) => $q->whereNull('usage_limit')->orWhereColumn('times_used', '<', 'usage_limit'));
    }

    /** No new programme-mode switch: points sources first, then offers, visits, service benefits. */
    public function mode(int $orgId, array $o): string
    {
        $points = $o['points_on_bookings'] || $o['desk_earn_enabled'] || $o['welcome_bonus_points'] > 0
            || $o['birthday_bonus_points'] > 0 || ($o['checkin_enabled'] && $o['checkin_points'] > 0)
            || ($o['referral_enabled'] && ($o['referrer_bonus_points'] > 0 || $o['referee_bonus_points'] > 0))
            || ($o['stamps_enabled'] && $o['stamp_reward_kind'] === 'points')
            || Reward::query()->where('organization_id', $orgId)->where('is_active', true)->where('points_cost', '>', 0)->exists();
        if ($points) return 'points';
        if (SpecialOffer::query()->where('organization_id', $orgId)->where('is_active', true)->exists()) return 'discounts';
        return $o['checkin_enabled'] || $o['tier_progress_by'] === 'visits' ? 'visits' : 'services';
    }

    public function summary(int $orgId, OverviewPeriod $clock): array
    {
        $o = ProgrammeOptions::for($orgId);
        $tiers = LoyaltyTier::query()->where('organization_id', $orgId)->where('is_active', true)->orderBy('sort_order')->orderBy('id')
            ->get(['id', 'name', 'min_points', 'min_visits', 'min_spend', 'invitation_only']);
        $reward = $this->rewards($orgId)->orderBy('points_cost')->orderBy('id')->first(['id', 'name', 'points_cost']);
        $setup = $this->setup->for($orgId);
        $mode = $this->mode($orgId, $o);
        $benefits = BenefitDefinition::query()->where('organization_id', $orgId)->where('is_active', true)->count();
        // Legacy programmes need not have used the wizard or a tier ladder. Reuse recorded setup facts;
        // an offers-only, visit-only or service programme must not disappear behind first-time setup.
        $inUse = collect($setup['steps'])->contains(fn ($step) => in_array($step['key'], ['rewards', 'member', 'scan'], true) && $step['done']);
        return ['mode' => $mode, 'options' => $o, 'tiers' => $tiers,
            'rewards' => $this->rewards($orgId)->count(), 'minimum_reward' => $reward,
            'benefits' => $benefits,
            'offers' => $this->offers($orgId, $clock->period->to)->count(), 'setup' => $setup,
            'configured' => $o['programme_setup_completed_at'] !== null || $tiers->isNotEmpty() || $inUse || $benefits > 0 || in_array($mode, ['discounts', 'visits'], true),
            'appearance' => AppLook::read()];
    }

    public function checks(int $orgId): array
    {
        $tiers = LoyaltyTier::query()->where('organization_id', $orgId)->orderBy('sort_order')->orderBy('id')->get();
        $benefits = BenefitDefinition::query()->where('organization_id', $orgId)->orderBy('sort_order')->get();
        $given = TierBenefit::query()->whereIn('tier_id', $tiers->pluck('id'))->where('is_active', true)->get();
        $o = ProgrammeOptions::for($orgId);
        $tierAdvice = TierAdvice::read($tiers->map(fn ($t) => [
            'id' => (int) $t->id, 'name' => $t->name, 'is_active' => (bool) $t->is_active,
            'invitation_only' => (bool) $t->invitation_only, 'min_points' => $t->min_points,
            'min_visits' => $t->min_visits, 'min_spend' => $t->min_spend,
        ])->all(), $benefits->map(fn ($b) => ['id' => (int) $b->id, 'name' => $b->name, 'is_active' => (bool) $b->is_active])->all(),
            $given->groupBy('benefit_id')->map(fn ($rows) => $rows->pluck('tier_id')->map(fn ($id) => (int) $id)->all())->all(), $o['tier_progress_by']);
        $ways = $this->advice->for($orgId, $o, Reward::query()->where('organization_id', $orgId)->where('is_active', true)->pluck('id')->map(fn ($id) => (int) $id)->all());
        $issues = [];
        foreach ($tierAdvice as $a) {
            $ids = array_column($a['tiers'] ?: $a['benefits'], 'id');
            $issues[] = ['id' => $a['code'] . ':' . implode('-', $ids), 'area' => 'program', 'code' => $a['code'],
                'level' => $a['level'], 'params' => $a['params'], 'entities' => $a['tiers'] ?: $a['benefits'],
                'href' => '/loyalty/program' . ($a['tiers'] ? '' : '?tab=benefits')];
        }
        foreach ($ways['advice'] as $a) {
            $issues[] = ['id' => $a['code'], 'area' => 'options', 'code' => $a['code'], 'level' => $a['level'],
                'params' => $a['params'], 'entities' => [], 'href' => $a['way'] === null ? '/loyalty/rewards' : '/loyalty/options?way=' . urlencode($a['way'])];
        }
        return ['issues' => $issues, 'warnings' => count(array_filter($issues, fn ($i) => $i['level'] === 'warn'))];
    }

    public function metrics(int $orgId, OverviewPeriod $clock): array
    {
        $mode = $this->mode($orgId, ProgrammeOptions::for($orgId));
        $memberIds = $this->members($orgId)->select('loyalty_members.id');
        $joined = $this->members($orgId)->whereRaw('COALESCE(joined_at, created_at) >= ?', [$clock->period->startUtc()])
            ->whereRaw('COALESCE(joined_at, created_at) < ?', [$clock->now->format('Y-m-d H:i:s')])->count();
        $metric = fn ($key, $value, $kind = 'period') => ['key' => $key, 'value' => $value, 'kind' => $kind];
        $pair = match ($mode) {
            'points' => [
                $metric('rewards_used', $clock->between(RewardRedemption::query()->where('organization_id', $orgId)->whereIn('member_id', clone $memberIds)
                    ->whereHas('reward')->where('status', RewardRedemption::STATUS_FULFILLED), 'fulfilled_at')->count()),
                $metric('points_available', (int) $this->members($orgId)->where('is_active', true)->sum('current_points'), 'current'),
            ],
            'discounts' => [
                $metric('offers_used', $clock->between(MemberOffer::query()->whereIn('member_id', clone $memberIds)->whereHas('offer')->where('status', 'used'), 'used_at')->count()),
                $metric('active_offers', $this->offers($orgId, $clock->period->to)->count(), 'current'),
            ],
            'visits' => [
                $metric('checkins', (int) $clock->between($this->visits($orgId)->where('venue_day', '>=', $clock->period->from)
                    ->where('venue_day', '<=', $clock->period->to), 'created_at')->sum('visits')),
                $metric('active_benefits', BenefitDefinition::query()->where('organization_id', $orgId)->where('is_active', true)->count(), 'current'),
            ],
            default => [
                $metric('benefits_fulfilled', $clock->between(BenefitEntitlement::query()->where('organization_id', $orgId)->whereIn('member_id', clone $memberIds)->where('status', 'fulfilled'), 'fulfilled_at')->count()),
                $metric('active_benefits', BenefitDefinition::query()->where('organization_id', $orgId)->where('is_active', true)->count(), 'current'),
            ],
        };
        return ['mode' => $mode, 'joined' => $joined, 'items' => [$metric('members', $this->members($orgId)->count(), 'current'), ...$pair]];
    }

    private function visits(int $orgId)
    {
        return DB::table('tier_qualification_counts')->where('organization_id', $orgId)
            ->whereIn('member_id', $this->members($orgId)->select('loyalty_members.id'))->whereNull('reversed_at')->where('visits', '>', 0);
    }

    public function queue(int $orgId, User $user): array
    {
        $ids = $this->members($orgId)->select('loyalty_members.id');
        $benefits = BenefitEntitlement::query()->where('organization_id', $orgId)->whereIn('member_id', clone $ids)
            ->whereIn('status', [...RequestQueue::WAITING, 'approved']);
        $rewards = RewardRedemption::query()->where('organization_id', $orgId)->whereIn('member_id', clone $ids)->whereHas('reward')
            ->where('status', RewardRedemption::STATUS_PENDING);
        $sources = ['benefits'];
        $total = (clone $benefits)->count();
        $items = $benefits->with(['member.user:id,name', 'benefit:id,name'])->orderBy('created_at')->orderBy('id')->limit(3)->get()->map(fn ($r) => [
            'source' => 'benefit', 'id' => (int) $r->id, 'status' => $r->status, 'title' => $r->benefit?->name,
            'member' => $r->member?->user?->name, 'created_at' => $r->created_at?->toIso8601String(),
            'href' => '/loyalty/requests?tab=' . ($r->status === 'approved' ? 'approved' : 'waiting') . '&request=' . $r->id,
        ])->all();
        if (LoyaltyAccess::has($user, LoyaltyAccess::REDEEM)) {
            $sources[] = 'redemptions';
            $total += (clone $rewards)->count();
            foreach ($rewards->with(['member.user:id,name', 'reward:id,name'])->orderBy('created_at')->orderBy('id')->limit(3)->get() as $r) {
                $items[] = ['source' => 'redemption', 'id' => (int) $r->id, 'status' => $r->status, 'title' => $r->reward?->name,
                    'member' => $r->member?->user?->name, 'created_at' => $r->created_at?->toIso8601String(),
                    'href' => '/loyalty/rewards?tab=redemptions&request=' . $r->id];
            }
        }
        usort($items, fn ($a, $b) => [$a['created_at'], $a['source'], $a['id']] <=> [$b['created_at'], $b['source'], $b['id']]);
        return ['total' => $total, 'items' => array_slice($items, 0, 3), 'sources' => $sources];
    }

    public function activity(int $orgId, OverviewPeriod $clock, string $filter): array
    {
        $items = [];
        $ids = $this->members($orgId)->select('loyalty_members.id');
        if ($filter === 'all') {
            $joined = $this->members($orgId)->whereRaw('COALESCE(joined_at, created_at) >= ?', [$clock->period->startUtc()])
                ->whereRaw('COALESCE(joined_at, created_at) < ?', [$clock->now->format('Y-m-d H:i:s')])
                ->with('user:id,name')->orderByRaw('COALESCE(joined_at, created_at) DESC')->orderByDesc('id')->limit(20)->get();
            foreach ($joined as $r) $items[] = ['source' => 'member', 'id' => (int) $r->id,
                'at' => ($r->joined_at ?? $r->created_at)->toIso8601String(), 'member' => $r->user?->name,
                'amount' => null, 'kind' => 'joined', 'label' => null, 'href' => '/loyalty/members/' . $r->id];
            $moves = TierAssessment::query()->where('organization_id', $orgId)->whereIn('member_id', clone $ids)
                ->whereNotNull('old_tier_id')->whereNotNull('new_tier_id')->whereColumn('old_tier_id', '!=', 'new_tier_id');
            foreach ($clock->between($moves, 'created_at')->with(['member.user:id,name', 'newTier:id,name'])
                ->orderByDesc('created_at')->orderByDesc('id')->limit(20)->get() as $r) {
                $items[] = ['source' => 'tier', 'id' => (int) $r->id, 'at' => $r->created_at->toIso8601String(),
                    'member' => $r->member?->user?->name, 'amount' => null, 'kind' => 'tier', 'label' => $r->newTier?->name,
                    'href' => '/loyalty/members/' . $r->member_id];
            }
            $fulfilled = BenefitEntitlement::query()->where('organization_id', $orgId)->whereIn('member_id', clone $ids)->where('status', 'fulfilled');
            foreach ($clock->between($fulfilled, 'fulfilled_at')->with(['member.user:id,name', 'benefit:id,name'])
                ->orderByDesc('fulfilled_at')->orderByDesc('id')->limit(20)->get() as $r) {
                $items[] = ['source' => 'benefit', 'id' => (int) $r->id, 'at' => $r->fulfilled_at->toIso8601String(),
                    'member' => $r->member?->user?->name, 'amount' => null, 'kind' => 'fulfilled', 'label' => $r->benefit?->name,
                    'href' => '/loyalty/requests?tab=done&request=' . $r->id];
            }
        }
        if ($filter === 'all') {
            $used = MemberOffer::query()->whereIn('member_id', clone $ids)->whereHas('offer')->where('status', 'used');
            foreach ($clock->between($used, 'used_at')->with(['member.user:id,name', 'offer:id,title'])
                ->orderByDesc('used_at')->orderByDesc('id')->limit(20)->get() as $r) {
                $items[] = ['source' => 'offer', 'id' => (int) $r->id, 'at' => $r->used_at->toIso8601String(),
                    'member' => $r->member?->user?->name, 'amount' => null, 'kind' => 'used', 'label' => $r->offer?->title,
                    'href' => '/loyalty/rewards?tab=offers'];
            }
        }
        if ($filter === 'all' || $filter === 'points') {
            $q = PointsTransaction::query()->where('organization_id', $orgId)->whereIn('member_id', clone $ids)
                ->where('is_reversed', false)->whereNull('reversal_of_id')->where('type', '!=', 'reverse');
            foreach ($clock->between($q, 'created_at')->with('member.user:id,name')->orderByDesc('created_at')->orderByDesc('id')->limit(20)->get() as $r) {
                $items[] = ['source' => 'points', 'id' => (int) $r->id, 'at' => $r->created_at->toIso8601String(),
                    'member' => $r->member?->user?->name, 'amount' => (int) $r->points, 'kind' => $r->type,
                    'label' => $r->description, 'href' => '/loyalty/members/' . $r->member_id];
            }
        }
        if ($filter === 'all' || $filter === 'rewards') {
            $q = RewardRedemption::query()->where('organization_id', $orgId)->whereIn('member_id', clone $ids)->whereHas('reward')->where('status', 'fulfilled');
            foreach ($clock->between($q, 'fulfilled_at')->with(['reward:id,name', 'member.user:id,name'])->orderByDesc('fulfilled_at')->orderByDesc('id')->limit(20)->get() as $r) {
                $items[] = ['source' => 'reward', 'id' => (int) $r->id, 'at' => $r->fulfilled_at->toIso8601String(),
                    'member' => $r->member?->user?->name, 'amount' => (int) $r->points_spent, 'kind' => 'fulfilled', 'label' => $r->reward?->name,
                    'href' => '/loyalty/rewards?tab=redemptions&request=' . $r->id];
            }
        }
        if ($filter === 'all' || $filter === 'visits') {
            $rows = $clock->between($this->visits($orgId), 'created_at')->where('venue_day', '>=', $clock->period->from)
                ->where('venue_day', '<=', $clock->period->to)->orderByDesc('created_at')->orderByDesc('id')->limit(20)->get();
            $members = $this->members($orgId)->whereIn('id', $rows->pluck('member_id'))->with('user:id,name')->get()->keyBy('id');
            foreach ($rows as $r) {
                $items[] = ['source' => 'visit', 'id' => (int) $r->id, 'at' => CarbonImmutable::parse($r->created_at, 'UTC')->toIso8601String(),
                    'member' => $members->get($r->member_id)?->user?->name, 'amount' => null, 'kind' => 'visit', 'label' => null,
                    'href' => '/loyalty/members/' . $r->member_id];
            }
        }
        usort($items, fn ($a, $b) => [$b['at'], $b['source'], $b['id']] <=> [$a['at'], $a['source'], $a['id']]);
        return ['items' => array_slice($items, 0, 20), 'filter' => $filter, 'limit' => 20];
    }
}
