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
        // "My business isn't listed" — a real, fully-provisioned generic
        // workspace rather than a silent fallback to hotel.
        'other',
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

        // Auto-create the org's default Brand on every new-org
        // creation. The 2026_05_10_100000_create_brands_table.php
        // migration backfilled brands for orgs that existed AT that
        // time, but the audit found NO downstream code path creating
        // a default brand for orgs created AFTER the migration ship.
        // Effect on a brand-new org: BrandSwitcher's "hide when
        // brands.length <= 1" silently held; `Brand::currentOrDefaultIdForOrg`
        // returned null; brand-scoped writes landed with `brand_id =
        // NULL`; widget URLs resolving by org token + legacy fallback
        // returned 404 because the default-brand row was absent.
        //
        // This hook puts the default brand back in lockstep with the
        // org. Multi-brand portfolios (Enterprise gate) still requires
        // BrandController::store for the 2nd+ brand; this just
        // guarantees the foundational #1 brand exists.
        static::created(function ($org) {
            if (!\Illuminate\Support\Facades\Schema::hasTable('brands')) return;

            // Skip when a default brand already exists for this org
            // (test fixtures, manual seeds, or a parallel-write race
            // that won the row first). SoftDeletes scope on Brand
            // EXCLUDES trashed rows, which matches the partial unique
            // `brands_org_default_unique` semantics (where
            // deleted_at IS NULL).
            $hasDefault = \App\Models\Brand::where('organization_id', $org->id)
                ->where('is_default', true)
                ->exists();
            if ($hasDefault) return;

            try {
                $baseSlug = \Illuminate\Support\Str::slug($org->name ?? '') ?: ('default-' . $org->id);
                \App\Models\Brand::create([
                    'organization_id' => $org->id,
                    'name'            => $org->name ?: 'Default',
                    'slug'            => substr($baseSlug, 0, 100),
                    'logo_url'        => $org->logo_url ?? null,
                    'widget_token'    => $org->widget_token ?: \Illuminate\Support\Str::random(32),
                    'is_default'      => true,
                    'sort_order'      => 0,
                ]);
            } catch (\Throwable $e) {
                // Defensive: race between two org-create paths (rare
                // — orgs are SaaS-side primary keys — but possible
                // during SSO bootstrap from concurrent admin tabs).
                // The partial unique catches it; surviving caller's
                // default brand stays. Log so the rare case is
                // visible in Nightwatch.
                \Log::warning('Organization::booted — default brand creation failed', [
                    'org_id' => $org->id,
                    'error'  => $e->getMessage(),
                ]);
            }
        });

        // Re-sync every landing page's industry snapshot when the org's own
        // industry changes. `landing_pages.industry` is written once, at
        // page-creation time (see LandingOnboardingService::newPageIndustry())
        // — it is NOT re-derived from the org on every render, because the
        // renderer treats it as the page's own committed choice (an existing
        // page's industry is deliberately independent of the org once it
        // exists — see that method's docblock). Nothing else re-reads the
        // org after that, so an org that corrects its industry (unset →
        // resolved to the platform default, or a genuine change of business)
        // otherwise keeps every one of its pages speaking the OLD industry's
        // language forever: wrong vocabulary (IndustryProfile), wrong
        // schema.org subtype, and — since the booking-gate round — a hotel
        // booking widget framed on a page that was never a hotel. There is
        // no in-product way to fix that page short of deleting it. This
        // hook is the one place that reconciles the two without touching
        // any of the three call sites that write `org->industry`
        // (AuthController's apply-industry + signup-backfill paths,
        // SaasAuthMiddleware's JWT backfill) — they only ever need to get
        // the ORG right; the pages following along is this hook's job.
        static::updated(function (Organization $org): void {
            if (! $org->wasChanged('industry')) {
                return;
            }

            // Guard for the same reason the `created` hook above guards on
            // `brands`: not every environment/test schema carries
            // landing_pages, and an org update must never start failing
            // because a feature table isn't provisioned yet.
            if (! \Illuminate\Support\Facades\Schema::hasTable('landing_pages')) {
                return;
            }

            // withoutGlobalScopes(): this runs in whatever request context
            // changed the org — including SaasAuthMiddleware's JWT sync,
            // where no tenant or brand is bound — so TenantScope/BrandScope
            // would either miss rows or throw. The explicit organization_id
            // where-clause below is the scope, and it deliberately covers
            // EVERY brand under the org (a multi-brand portfolio's pages all
            // snapshot the same org industry, so all of them resync).
            // resolved_industry (not the raw column) so an alias like
            // 'hospitality' lands on the page normalised, the same value
            // every renderer already treats as canonical.
            \App\Models\LandingPage::withoutGlobalScopes()
                ->where('organization_id', $org->id)
                ->update(['industry' => $org->resolved_industry]);
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
        return $this->explicit_industry ?? self::DEFAULT_INDUSTRY;
    }

    /**
     * The industry this organisation actually chose, or null if it never did.
     *
     * Same two tiers as resolved_industry without the platform default, which
     * is the whole point: `resolved_industry` cannot tell "picked hotel" from
     * "picked nothing", and a caller that guesses wrong in PUBLIC has to be
     * able to. A landing page built on the defaulted value invited an
     * education tenant's visitors to "Book your stay" and called their page
     * "The Hotel" -- fine as admin chrome, published on a customer's own
     * domain it is just wrong. Surfaces that dress the ADMIN keep using
     * resolved_industry and keep their opinionated default.
     */
    public function getExplicitIndustryAttribute(): ?string
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

        return null;
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
        // Delegates so "explicitly picked" has ONE definition. This used to
        // read the column alone, which called an org that had only ever set
        // the legacy crm_settings preset "not picked" -- and the banner this
        // guards then nagged a tenant who had in fact chosen. The accessor
        // walks both tiers, so the legacy preset now counts as the real
        // choice it always was.
        return $this->explicit_industry !== null;
    }
}
