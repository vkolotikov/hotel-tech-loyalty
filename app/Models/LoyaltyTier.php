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

    /**
     * Every field TierController validates must be here.
     *
     * Seven of them were missing — min_nights, min_stays, min_spend,
     * qualification_window, grace_period_days, soft_landing and
     * invitation_only — so `LoyaltyTier::create($validated)` silently
     * dropped them and returned 201. An admin could set "invitation only"
     * and a 2,500 spend threshold, see "Tier created", and get a tier with
     * neither. LoyaltyService branches on all seven, so they were live
     * settings that could not be set.
     */
    protected $fillable = [
        'organization_id', 'name', 'description', 'min_points', 'max_points',
        'earn_rate', 'bonus_nights', 'color_hex', 'icon', 'perks',
        'min_nights', 'min_stays', 'min_spend', 'min_visits',
        'qualification_window', 'grace_period_days',
        'soft_landing', 'invitation_only',
        'sort_order', 'is_active',
    ];

    protected $casts = [
        'perks' => 'array',
        'is_active' => 'boolean',
        'earn_rate' => 'decimal:2',
        'min_spend' => 'decimal:2',
        'min_visits' => 'integer',
        'soft_landing' => 'boolean',
        'invitation_only' => 'boolean',
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

        // Release 9: read once per request or job (and at most a minute in a long one), never kept in the cache: on
        // Laravel Cloud the default cache is each container's own files, so a tier switched off or a floor changed held
        // on the other containers for half an hour — members were assessed into a tier that was no longer offered.
        $memo = self::memo();
        $seen = $memo[$orgId] ?? null;
        if (!is_array($seen) || time() - $seen['at'] > self::MEMO_SECONDS) {
            $seen = ['at' => time(), 'tiers' => static::where('is_active', true)->orderBy('min_points')->get()];
            $memo[$orgId] = $seen;
        }

        return $seen['tiers'];
    }

    private const MEMO = 'loyalty.tiers.active';

    private const MEMO_SECONDS = 60;

    /** @return \ArrayObject<int, array{at: int, tiers: Collection<int, self>}> */
    private static function memo(): \ArrayObject
    {
        $app = app();
        if (!$app->bound(self::MEMO)) {
            $app->scoped(self::MEMO, fn () => new \ArrayObject());
        }

        return $app->make(self::MEMO);
    }

    public static function flushCacheFor(?int $orgId): void
    {
        if ($orgId) {
            Cache::forget("org:{$orgId}:loyalty_tiers_active");
            unset(self::memo()[$orgId]);
        }
    }
}
