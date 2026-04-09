<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

class LoyaltyTier extends Model
{
    use BelongsToOrganization;

    /** Cache TTL for the per-org active-tiers collection. */
    private const CACHE_TTL = 1800;

    protected $fillable = [
        'organization_id', 'name', 'min_points', 'max_points', 'earn_rate', 'bonus_nights',
        'color_hex', 'icon', 'perks', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'perks' => 'array',
        'is_active' => 'boolean',
        'earn_rate' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        // Tier writes are rare but must invalidate the per-org cache.
        static::saved(fn (self $t) => static::flushCacheFor($t->organization_id));
        static::deleted(fn (self $t) => static::flushCacheFor($t->organization_id));
    }

    public function members()
    {
        return $this->hasMany(LoyaltyMember::class, 'tier_id');
    }

    public function tierBenefits(): HasMany
    {
        return $this->hasMany(TierBenefit::class, 'tier_id');
    }

    public function benefits(): BelongsToMany
    {
        return $this->belongsToMany(BenefitDefinition::class, 'tier_benefits', 'tier_id', 'benefit_id')
            ->withPivot('property_id', 'value', 'custom_description', 'is_active')
            ->withTimestamps();
    }

    public function getNextTier(): ?self
    {
        return self::where('min_points', '>', $this->min_points)
            ->where('is_active', true)
            ->orderBy('min_points')
            ->first();
    }

    /**
     * All active tiers for the current org, cached. Read-heavy and rarely
     * written, so callers in the points hot-path should prefer this and
     * filter in PHP rather than re-querying.
     */
    public static function cachedActiveForCurrentOrg(): Collection
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        if (!$orgId) {
            return static::where('is_active', true)->orderBy('min_points')->get();
        }

        return Cache::remember(
            "org:{$orgId}:loyalty_tiers_active",
            self::CACHE_TTL,
            fn () => static::where('is_active', true)->orderBy('min_points')->get()
        );
    }

    public static function flushCacheFor(?int $orgId): void
    {
        if ($orgId) {
            Cache::forget("org:{$orgId}:loyalty_tiers_active");
        }
    }
}
