<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Organization extends Model
{
    protected $fillable = [
        'name', 'slug', 'saas_org_id', 'widget_token', 'legal_name', 'tax_id', 'email', 'phone',
        'address', 'country', 'currency', 'timezone', 'logo_url',
        'website', 'settings', 'is_active',
        'plan_slug', 'subscription_status', 'entitled_products', 'plan_features', 'entitlements_synced_at',
    ];

    protected static function booted(): void
    {
        // Auto-generate widget_token on creation if column exists
        static::creating(function ($org) {
            if (empty($org->widget_token) && \Illuminate\Support\Facades\Schema::hasColumn('organizations', 'widget_token')) {
                $org->widget_token = \Illuminate\Support\Str::random(32);
            }
        });
    }

    protected $casts = [
        'settings'              => 'array',
        'is_active'             => 'boolean',
        'entitled_products'     => 'array',
        'plan_features'         => 'array',
        'entitlements_synced_at'=> 'datetime',
    ];

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    // ─── Plan / entitlement helpers ───────────────────────────
    // These read from the columns populated by SaasAuthMiddleware. The
    // middleware refreshes them in the background, so this is a synchronous
    // check with no network call.

    /** True if the org's current plan unlocks the named product (e.g. "loyalty"). */
    public function hasProduct(string $slug): bool
    {
        $list = $this->entitled_products ?: [];
        return in_array($slug, $list, true);
    }

    /** True if the org's current plan exposes the named feature flag. */
    public function hasFeature(string $key): bool
    {
        $features = $this->plan_features ?: [];
        if (!array_key_exists($key, $features)) return false;
        $val = $features[$key];
        if (is_bool($val))   return $val;
        if (is_string($val)) return !in_array(strtolower($val), ['', 'false', '0', 'none', 'no'], true);
        return (bool) $val;
    }

    /** Raw feature value (string for tier/limit features). */
    public function featureValue(string $key, mixed $default = null): mixed
    {
        $features = $this->plan_features ?: [];
        return $features[$key] ?? $default;
    }

    /** Whether the org has any active subscription that grants tool access. */
    public function hasActiveSubscription(): bool
    {
        return in_array($this->subscription_status, ['ACTIVE', 'TRIALING'], true);
    }
}
