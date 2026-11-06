<?php

namespace App\Services\Loyalty\Insights;

use App\Models\LoyaltyMember;
use Illuminate\Database\Eloquent\Builder;

/** One current-member population for every report metric, including linked-guest sales. */
final class InsightsAudience
{
    public const STATES = ['all', 'active', 'inactive'];
    public const CONSENTS = ['all', 'yes', 'no'];

    public function __construct(
        public readonly int $orgId,
        public readonly ?int $tierId = null,
        public readonly string $state = 'all',
        public readonly string $consent = 'all',
        public readonly bool $withoutTier = false,
    ) {}

    public function members(string $alias = 'loyalty_members'): Builder
    {
        return LoyaltyMember::withoutGlobalScopes()->from('loyalty_members as ' . $alias)
            ->where($alias . '.organization_id', $this->orgId)
            ->when($this->tierId !== null, fn ($q) => $q->where($alias . '.tier_id', $this->tierId))
            ->when($this->withoutTier, fn ($q) => $q->whereNull($alias . '.tier_id'))
            ->when($this->state !== 'all', fn ($q) => $q->where($alias . '.is_active', $this->state === 'active'))
            ->when($this->consent === 'yes', fn ($q) => $q->where($alias . '.marketing_consent', true))
            ->when($this->consent === 'no', fn ($q) => $q->where(fn ($w) => $w->where($alias . '.marketing_consent', false)->orWhereNull($alias . '.marketing_consent')));
    }

    public static function options(): array
    {
        return ['states' => self::STATES, 'consents' => self::CONSENTS];
    }
}
