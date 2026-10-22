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
     * Five additional preset families available via Settings → Industry
     * (no dedicated sub-brand domain, no per-industry KPI / email / mobile
     * polish in the first plan wave): legal, real_estate, education, fitness,
     * services (agencies, studios, made-to-order production, B2B services).
     *
     * Used by validation (registration + apply-industry endpoints), by the
     * sub-domain detector's reverse map sanity-check, and by adversarial
     * tests against the IndustryPresetService.
     */
    public const INDUSTRIES = [
        'hotel', 'beauty', 'medical', 'restaurant',
        'legal', 'real_estate', 'education', 'fitness',
        'services',
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
        //
        // Release 6 (spec 2026-10-23 §2 item 1): the brand is written for
        // THIS organisation whatever tenant is bound (ensureDefaultBrand()).
        // Before, Brand's BelongsToOrganization hook stamped the BOUND
        // tenant's id on it and the "already has one" check was
        // tenant-scoped too, so an organisation created while another was
        // bound (a super admin, a console command, a test) wrote a second
        // default for the bound one — refused on PostgreSQL by
        // `brands_org_default_unique`, the error swallowed below — and was
        // left without a brand. `php artisan brands:ensure-default` repairs
        // an organisation that was.
        static::created(function ($org) {
            if (!\Illuminate\Support\Facades\Schema::hasTable('brands')) return;

            try {
                $org->ensureDefaultBrand();
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

    /**
     * Gives this organisation its default brand when it has none (release 6, spec 2026-10-23 §2 item 1): its earliest
     * brand that is not deleted is made the default (as `brands:heal-orphan-rows` does), and an organisation with no
     * brand at all gets one named after it — its widget token (unless a brand already holds it), its logo, a slug free
     * among its brands, deleted ones included (`brands_org_slug_unique` counts them). Read and written for THIS
     * organisation whatever tenant is bound: the checks lift the tenant scope and name the organisation, and the new
     * brand is created with this organisation bound for that one write, because Brand's BelongsToOrganization hook
     * stamps the bound tenant's id on every new row; the binding is put back as it was. The insert runs in its own
     * (nested) transaction, so a default written a moment before by someone else (the partial unique index
     * `brands_org_default_unique`) is answered by reading again, and never aborts the caller's transaction on
     * PostgreSQL. With $write false nothing is written: the answer says what would be done, a would-be brand unsaved.
     *
     * @return array{action: 'none'|'promoted'|'created', brand: ?Brand} `none` with the default it already has
     */
    public function ensureDefaultBrand(bool $write = true): array
    {
        $brands = fn () => Brand::withoutGlobalScopes()->where('organization_id', $this->id)->whereNull('deleted_at');
        $current = fn () => $brands()->where('is_default', true)->orderBy('id')->first();

        if ($default = $current()) {
            return ['action' => 'none', 'brand' => $default];
        }

        $earliest = $brands()->orderBy('id')->first();
        if ($earliest) {
            if ($write) {
                Brand::withoutGlobalScopes()->whereKey($earliest->id)->update(['is_default' => true, 'updated_at' => now()]);
                $earliest->refresh();
            } else {
                $earliest->is_default = true;
            }

            return ['action' => 'promoted', 'brand' => $earliest];
        }

        $base = substr(\Illuminate\Support\Str::slug((string) ($this->name ?? '')) ?: ('default-' . $this->id), 0, 90);
        $slug = $base;
        for ($n = 2; Brand::withoutGlobalScopes()->where('organization_id', $this->id)->where('slug', $slug)->exists(); $n++) {
            $slug = $base . '-' . $n;
        }
        $token = (string) ($this->widget_token ?? '');
        if ($token === '' || Brand::withoutGlobalScopes()->where('widget_token', $token)->exists()) {
            $token = \Illuminate\Support\Str::random(32);
        }
        $brand = new Brand([
            'name'         => $this->name ?: 'Default',
            'slug'         => $slug,
            'logo_url'     => $this->logo_url ?? null,
            'widget_token' => $token,
            'is_default'   => true,
            'sort_order'   => 0,
        ]);
        $brand->organization_id = $this->id;
        if (!$write) {
            return ['action' => 'created', 'brand' => $brand];
        }

        $wasBound = app()->bound('current_organization_id');
        $prior = $wasBound ? app('current_organization_id') : null;
        app()->instance('current_organization_id', (int) $this->id);
        try {
            \Illuminate\Support\Facades\DB::transaction(fn () => $brand->save());
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            // Written a moment before by someone else: answer by what is stored now.
            if ($default = $current()) {
                return ['action' => 'none', 'brand' => $default];
            }
            throw $e;
        } finally {
            $wasBound ? app()->instance('current_organization_id', $prior) : app()->forgetInstance('current_organization_id');
        }

        return ['action' => 'created', 'brand' => $brand];
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

    // ─── Workspaces ────────────────────────────────────────────
    // Product experiences beside the full admin; the appointments workspace
    // is the first. HexaTech Content (`/content`, spec 2026-10-14) is the
    // second, HexaTech Loyalty (`/loyalty`, spec 2026-10-21) the third; neither is part of the Appointments plan.
    // Each has a default for an organisation that never set
    // anything (WORKSPACE_DEFAULTS): the owner ruled on 2026-10-01 that every
    // organisation has the appointments workspace, signing in to the full
    // admin as before, unless an operator switches it off. What an operator
    // sets lives under settings.workspaces — a column no tenant endpoint and
    // no billing sync writes (`php artisan workspace:appointments`).

    /** Every workspace there is, and whether an organisation that never set anything has it. */
    public const WORKSPACE_DEFAULTS = ['appointments' => true, 'content' => true, 'loyalty' => true];

    /** Products an organisation on the Appointments plan holds (Part C spec §6.1). */
    public const APPOINTMENTS_PLAN_PRODUCTS = ['appointments', 'booking'];

    /** @return array{enabled: bool, landing: bool} */
    public function workspace(string $name): array
    {
        // The Appointments plan IS the workspace: always on, and where its staff land.
        if ($name === 'appointments' && $this->appointmentsOnly()) {
            return ['enabled' => true, 'landing' => true];
        }
        // The Appointments plan holds the appointments workspace and nothing else (spec 2026-10-14 §6.3).
        if ($name !== 'appointments' && $this->appointmentsOnly()) {
            return ['enabled' => false, 'landing' => false];
        }

        $row = (array) data_get($this->settings ?? [], "workspaces.{$name}", []);
        $enabled = (bool) ($row['enabled'] ?? (self::WORKSPACE_DEFAULTS[$name] ?? false));

        return [
            'enabled' => $enabled,
            // Landing means nothing while the workspace is off.
            'landing' => $enabled && (bool) ($row['landing'] ?? false),
        ];
    }

    public function workspaceEnabled(string $name): bool
    {
        return $this->workspace($name)['enabled'];
    }

    /** Whether this organisation's setting differs from the default (off, landing on the workspace, or an appointments-only mark). */
    public function workspaceIsException(string $name): bool
    {
        if ($name === 'appointments' && $this->appointmentsOnlyMark() !== null) {
            return true;
        }

        return $this->workspace($name) !== ['enabled' => self::WORKSPACE_DEFAULTS[$name] ?? false, 'landing' => false];
    }

    public function setWorkspace(string $name, bool $enabled, bool $landing = false): void
    {
        $settings = $this->settings ?? [];
        $row = ['enabled' => $enabled, 'landing' => $enabled && $landing];
        // The operator's appointments-only mark is not this switch's to drop.
        $only = data_get($settings, "workspaces.{$name}.only");
        if (is_bool($only)) {
            $row['only'] = $only;
        }
        data_set($settings, "workspaces.{$name}", $row);
        // One landing per organisation: landing on this workspace takes it from every other one.
        if ($row['landing']) {
            foreach (array_keys(self::WORKSPACE_DEFAULTS) as $other) {
                if ($other !== $name && data_get($settings, "workspaces.{$other}.landing") === true) {
                    data_set($settings, "workspaces.{$other}.landing", false);
                }
            }
        }
        $this->forceFill(['settings' => $settings])->save();
    }

    /**
     * What a staff user's sign-in answer carries: the enabled workspaces,
     * null when there are none. For the appointments workspace it also
     * says whether the venue has an active service — the full admin shows
     * its way into the workspace only where something can be booked.
     *
     * @return array<string, array{landing: bool, has_services?: bool, only?: bool}>|null
     */
    public function workspacesPayload(): ?array
    {
        $out = [];
        foreach (array_keys(self::WORKSPACE_DEFAULTS) as $name) {
            $workspace = $this->workspace($name);
            if (!$workspace['enabled']) {
                continue;
            }
            $out[$name] = ['landing' => $workspace['landing']];
            if ($name === 'appointments') {
                $out[$name]['has_services'] = Service::withoutGlobalScopes()
                    ->where('organization_id', $this->id)
                    ->where('is_active', true)
                    ->exists();
                $out[$name]['only'] = $this->appointmentsOnly();
            }
        }

        return $out ?: null;
    }

    // ─── The Appointments plan (Part C) ────────────────────────
    // A cheaper plan with only the appointments workspace and the public
    // booking page: its staff reach nothing else (the `admin.access`
    // middleware answers 403 not_in_plan), they sign in to the workspace,
    // and loyalty is off whatever tiers exist.

    /**
     * Whether this organisation is on the Appointments plan. An operator's
     * mark decides first (`workspace:appointments --only` / `--not-only`);
     * otherwise billing's product list: `appointments` and nothing outside
     * APPOINTMENTS_PLAN_PRODUCTS; when that list is empty (billing could not
     * be reached, or a legacy organisation), the plan slug.
     */
    public function appointmentsOnly(): bool
    {
        $mark = $this->appointmentsOnlyMark();
        if ($mark !== null) {
            return $mark;
        }

        $products = (array) ($this->entitled_products ?: []);
        if ($products !== []) {
            return in_array('appointments', $products, true)
                && array_diff($products, self::APPOINTMENTS_PLAN_PRODUCTS) === [];
        }

        return $this->plan_slug === 'appointments';
    }

    /** 'operator' when an operator's mark decides, 'plan' when billing makes it appointments-only, null otherwise. */
    public function appointmentsOnlySource(): ?string
    {
        if ($this->appointmentsOnlyMark() !== null) {
            return 'operator';
        }

        return $this->appointmentsOnly() ? 'plan' : null;
    }

    /** For callers that hold only an id: the loyalty switch, guest enrolment, member sign-up, the access map. */
    public static function isAppointmentsOnly(?int $orgId): bool
    {
        return $orgId ? (bool) self::withoutGlobalScopes()->find($orgId)?->appointmentsOnly() : false;
    }

    /** true or false: an operator decides; null: billing decides again. */
    public function setAppointmentsOnly(?bool $only): void
    {
        $settings = $this->settings ?? [];
        $row = (array) data_get($settings, 'workspaces.appointments', []);
        if ($only === null) {
            unset($row['only']);
        } else {
            $row['only'] = $only;
        }
        data_set($settings, 'workspaces.appointments', $row);
        $this->forceFill(['settings' => $settings])->save();
    }

    private function appointmentsOnlyMark(): ?bool
    {
        $mark = data_get($this->settings ?? [], 'workspaces.appointments.only');

        return is_bool($mark) ? $mark : null;
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
