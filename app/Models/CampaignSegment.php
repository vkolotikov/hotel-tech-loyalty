<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;
use App\Traits\BelongsToOrganization;

class CampaignSegment extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'description', 'rules', 'estimated_size',
        'last_computed_at', 'created_by', 'is_dynamic',
    ];

    protected $casts = [
        'rules'            => 'array',
        'is_dynamic'       => 'boolean',
        'last_computed_at' => 'datetime',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Build a query for members matching this segment's rules.
     */
    public function buildQuery(): Builder
    {
        $query = LoyaltyMember::query()->with(['user', 'tier']);

        foreach ($this->rules as $rule) {
            $field    = $rule['field'] ?? null;
            $operator = $rule['operator'] ?? 'eq';
            $value    = $rule['value'] ?? null;

            if (!$field) continue;

            match ($field) {
                'tier_id' => $query->where('tier_id', $this->sqlOp($operator), $value),
                'current_points' => $query->where('current_points', $this->sqlOp($operator), $value),
                'lifetime_points' => $query->where('lifetime_points', $this->sqlOp($operator), $value),
                'is_active' => $query->where('is_active', (bool) $value),
                'joined_days_ago' => $query->where('joined_at', $this->sqlOp($this->invertOp($operator)), now()->subDays((int) $value)),
                'last_active_days_ago' => $query->where('last_activity_at', $this->sqlOp($this->invertOp($operator)), now()->subDays((int) $value)),
                'has_push_token' => $query->whereNotNull('expo_push_token'),
                'marketing_consent' => $query->where('marketing_consent', (bool) $value),
                'nationality' => $query->whereHas('user', fn($q) => $q->where('nationality', $value)),
                'language' => $query->whereHas('user', fn($q) => $q->where('language', $value)),
                'birthday_month' => $query->whereHas('user', fn($q) => $q->whereMonth('date_of_birth', $value)),
                'property_id' => $query->where('property_id', $value),
                'qualifying_nights' => $query->where('qualifying_nights', $this->sqlOp($operator), $value),
                default => null,
            };
        }

        return $query;
    }

    /**
     * Compute and cache the estimated size.
     */
    public function computeSize(): int
    {
        $count = $this->buildQuery()->count();
        $this->update([
            'estimated_size'   => $count,
            'last_computed_at' => now(),
        ]);
        return $count;
    }

    private function sqlOp(string $op): string
    {
        return match ($op) {
            'eq'  => '=',
            'neq' => '!=',
            'gt'  => '>',
            'gte' => '>=',
            'lt'  => '<',
            'lte' => '<=',
            default => '=',
        };
    }

    private function invertOp(string $op): string
    {
        // "joined more than X days ago" means joined_at < now()-X
        return match ($op) {
            'gt'  => 'lt',
            'gte' => 'lte',
            'lt'  => 'gt',
            'lte' => 'gte',
            default => $op,
        };
    }
}
