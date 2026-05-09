<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Organization extends Model
{
    protected $fillable = [
        'name', 'slug', 'saas_org_id', 'widget_token', 'legal_name', 'tax_id', 'email', 'phone',
        'address', 'country', 'currency', 'timezone', 'logo_url',
        'website', 'settings', 'is_active',
        'plan_slug', 'subscription_status', 'trial_end', 'trial_started_at', 'period_end',
        'entitled_products', 'plan_features', 'entitlements_synced_at',
        'saas_deleted_at',
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
        'trial_end'             => 'datetime',
        'trial_started_at'      => 'datetime',
        'period_end'            => 'datetime',
        'entitlements_synced_at'=> 'datetime',
        'saas_deleted_at'       => 'datetime',
    ];

    /** Orgs whose SaaS company still exists (the default for tenant lookups). */
    public function scopeActive($query)
    {
        return $query->whereNull('saas_deleted_at');
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    /**
     * All brands under this organization. See MULTI_BRAND_PLAN.md for the
     * conceptual model — chatbot, widget, booking, knowledge live at brand;
     * CRM and loyalty live at org.
     */
    public function brands(): HasMany
    {
        return $this->hasMany(Brand::class);
    }

    /**
     * The org's default brand. Every organization has exactly one (DB-enforced
     * via partial unique index). Brand-scoped code that lacks an explicit
     * brand context falls back to this.
     */
    public function defaultBrand(): HasOne
    {
        return $this->hasOne(Brand::class)->where('is_default', true);
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
