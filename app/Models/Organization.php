<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Organization extends Model
{
    /**
     * Canonical industry ids supported by the platform.
     *
     * Four go-to-market sub-brands (decision #7 in
     * apps/loyalty/INDUSTRY_PLATFORM_PLAN.md):
     *   hotel       → HotelTechAI    (hotel-tech.ai)
     *   beauty      → BeautyTech.uk  (beauty-tech.uk)
     *   medical     → MedTechAI      (med.hexa-tech.uk)
     *   restaurant  → HospitalityTech (hospitality.hexa-tech.uk)
     *
     * Four additional preset families available via Settings → Industry
     * (no dedicated sub-brand domain, no per-industry KPI / email / mobile
     * polish in the first plan wave): legal, real_estate, education, fitness.
     *
     * Used by validation (registration + apply-industry endpoints), by the
     * sub-domain detector's reverse map sanity-check, and by adversarial
     * tests against the IndustryPresetService.
     */
    public const INDUSTRIES = [
        'hotel', 'beauty', 'medical', 'restaurant',
        'legal', 'real_estate', 'education', 'fitness',
    ];

    /**
     * Aliases that should be accepted at write-time but normalised to a
     * canonical id before storage. Keeps the accessor robust if a Phase 2
     * controller (or a SaaS-side super-admin tool) writes a "natural"
     * value like `hospitality`. The HospitalityTech sub-brand uses
     * `restaurant` as its canonical preset id (see CLAUDE.md soft-map note).
     */
    public const INDUSTRY_ALIASES = [
        'hospitality' => 'restaurant',
    ];

    /**
     * Sub-brand industries — the four with branded sub-domains, polished
     * Phase 6 KPIs, Phase 8 email partials and Phase 9 mobile theming.
     */
    public const GTM_INDUSTRIES = ['hotel', 'beauty', 'medical', 'restaurant'];

    /** Fallback industry id for orgs that have never picked one. */
    public const DEFAULT_INDUSTRY = 'hotel';

    protected $fillable = [
        'name', 'slug', 'saas_org_id', 'widget_token', 'legal_name', 'tax_id', 'email', 'phone',
        'address', 'country', 'currency', 'timezone', 'logo_url',
        'website', 'settings', 'is_active',
        'plan_slug', 'subscription_status', 'trial_end', 'trial_started_at', 'period_end',
        'entitled_products', 'plan_features', 'entitlements_synced_at',
        'saas_deleted_at',
        // Industry Platform Plan Phase 1 — canonical source of truth for the
        // industry-aware admin surface. Falls back via getResolvedIndustryAttribute().
        'industry',
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

    // ─── Industry resolution ───────────────────────────────────
    // Reads in fallback order so the platform behaves correctly for
    // every org regardless of which Phase shipped first. Industry
    // Platform Plan Phase 1 (foundation).

    /**
     * Normalise an industry id — accepts canonical values, alias values
     * (e.g. 'hospitality' → 'restaurant'), or null/empty (→ null).
     * Returns null for anything else so callers can decide whether to
     * fall through to DEFAULT_INDUSTRY or reject as invalid.
     */
    public static function normaliseIndustry(?string $raw): ?string
    {
        if (!is_string($raw) || $raw === '') {
            return null;
        }
        if (isset(self::INDUSTRY_ALIASES[$raw])) {
            return self::INDUSTRY_ALIASES[$raw];
        }
        return in_array($raw, self::INDUSTRIES, true) ? $raw : null;
    }

    /**
     * Effective industry for this org — never returns null.
     *
     * Resolution order:
     *   1. `organizations.industry` column (set at registration in Phase 2,
     *      backfilled in Phase 10). Aliases are normalised (e.g. an org
     *      whose column was somehow written as 'hospitality' resolves to
     *      'restaurant').
     *   2. Legacy `crm_settings.industry_preset` row (written by
     *      `IndustryPresetService::apply()` since CRM v2 / 2026-05).
     *      `CrmSetting::$casts = ['value' => 'json']` so `$row->value`
     *      is already a decoded PHP string — no trim/decode needed.
     *   3. `self::DEFAULT_INDUSTRY` = 'hotel' — every code path in the
     *      platform must work when called against a hotel org without
     *      surprises, so this is the safe fallback for unseeded orgs.
     *
     * Accessor name `resolved_industry` (not `industry`) is deliberate —
     * `$org->industry` returns the raw column (which can be null) and stays
     * intuitive; `$org->resolved_industry` always returns a usable id.
     *
     * Not memoised. Static caching across the process would return stale
     * values to long-running queue workers + Octane after a Phase 2
     * apply-industry mutation; instance-only memoisation would surprise
     * any caller that does `$org->update(['industry' => …])` then re-reads
     * `$org->resolved_industry` in the same flow. The legacy fallback is
     * one indexed `crm_settings` lookup keyed on `(organization_id, key)`
     * which is well within budget for the ~5 reads per request this
     * accessor sees on a typical SPA bootstrap.
     */
    public function getResolvedIndustryAttribute(): string
    {
        // Tier 1: the canonical column. Read raw to avoid recursing into
        // any future accessor someone might add on `industry`.
        $direct = self::normaliseIndustry($this->attributes['industry'] ?? null);
        if ($direct !== null) {
            return $direct;
        }

        // Tier 2: legacy crm_settings.industry_preset. Two-step query —
        // (1) tenant-scoped lookup for the normal request lifecycle (the
        // global scope filters by current_organization_id), (2) explicit
        // org_id filter for callers without bound tenant context (console
        // commands, queue workers, public routes). Step 2 is the safety
        // net; on a regular /me request step 1 already returns the row.
        try {
            $legacy = \App\Models\CrmSetting::where('key', 'industry_preset')->first();
            if (!$legacy && $this->id) {
                $legacy = \App\Models\CrmSetting::withoutGlobalScopes()
                    ->where('organization_id', $this->id)
                    ->where('key', 'industry_preset')
                    ->first();
            }
            // value is JSON-cast on CrmSetting — already a decoded string.
            $normalised = self::normaliseIndustry(is_string($legacy?->value) ? $legacy->value : null);
            if ($normalised !== null) {
                return $normalised;
            }
        } catch (\Illuminate\Database\QueryException $e) {
            // crm_settings table missing in a fresh test env, transient
            // Postgres hiccup, schema drift. Log so a 0.1% transient-fail
            // rate doesn't silently render hotel chrome to a real beauty
            // org without any signal in Nightwatch.
            \Log::warning('Organization::resolved_industry legacy fallback failed', [
                'org_id' => $this->id,
                'error'  => $e->getMessage(),
            ]);
        }

        return self::DEFAULT_INDUSTRY;
    }

    /**
     * True when the org has explicitly picked an industry — distinguishes
     * "real choice" from "defaulting to hotel because we couldn't find one".
     * Used by Phase 4's mismatch banner (which should NOT prompt an org
     * that legitimately hasn't picked yet — it should silently apply the
     * sub-domain-detected industry). Normalises aliases so `hospitality`
     * counts as an explicit choice even though it resolves to `restaurant`.
     */
    public function hasExplicitIndustry(): bool
    {
        return self::normaliseIndustry($this->attributes['industry'] ?? null) !== null;
    }
}
