<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * A brand is a marketing/operational sub-division inside an organization.
 *
 * Each brand owns its own AI chatbot config, knowledge base, chat widget,
 * booking-engine config, theme, and properties. CRM (guests, inquiries,
 * reservations) and loyalty (members, points, tiers) sit ABOVE brand at
 * the organization level — see MULTI_BRAND_PLAN.md.
 *
 * One default brand exists per organization (DB-enforced via partial unique
 * index `brands_org_default_unique`). Single-brand orgs only ever see the
 * default; the admin SPA hides the brand switcher in that case.
 */
class Brand extends Model
{
    use SoftDeletes, BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'name',
        'slug',
        'description',
        'logo_url',
        'primary_color',
        'widget_token',
        'domain',
        'is_default',
        'sort_order',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'sort_order' => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (Brand $brand) {
            if (empty($brand->widget_token)) {
                $brand->widget_token = Str::random(32);
            }
            if (empty($brand->slug) && !empty($brand->name)) {
                $brand->slug = Str::slug($brand->name);
            }
        });

        // Keep the org's denormalized widget_token in sync with the default
        // brand. Legacy code paths read from organizations.widget_token; the
        // brand owns the canonical value but mirrors it back so the column
        // can be removed cleanly in a later phase.
        static::saved(function (Brand $brand) {
            if ($brand->is_default && $brand->wasChanged('widget_token')) {
                Organization::query()
                    ->withoutGlobalScopes()
                    ->where('id', $brand->organization_id)
                    ->update(['widget_token' => $brand->widget_token]);
            }
        });
    }

    public function properties(): HasMany
    {
        return $this->hasMany(Property::class);
    }

    /**
     * Resolve the brand id to use for "single config per brand" lookups in
     * brand-scoped controllers/services. Order:
     *   1. The brand currently bound by BrandMiddleware (admin SPA picked one)
     *   2. The org's default brand (legacy callers without brand context)
     * Returns null only if the org has no default brand at all (shouldn't
     * happen post-Phase-1 backfill).
     */
    public static function currentOrDefaultIdForOrg(int $orgId): ?int
    {
        if (app()->bound('current_brand_id') && app('current_brand_id')) {
            return (int) app('current_brand_id');
        }
        return static::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_default', true)
            ->value('id');
    }

    /**
     * Resolve a brand from a public widget token (e.g. the path segment in
     * /widget/{token}, /book/{token}, /chat-widget/{token}). Side-effect:
     * binds `current_organization_id` and `current_brand_id` to the container
     * so downstream queries via TenantScope + BrandScope automatically scope
     * to the correct brand without per-route plumbing.
     *
     * Two lookup paths:
     *   1. brands.widget_token — every brand has one (unique)
     *   2. organizations.widget_token — legacy fallback for tokens that
     *      were issued before the brand migration. Resolves to the org's
     *      default brand. Both columns mirror each other for the default
     *      brand so this is rarely the path that actually fires; it exists
     *      to never break a public URL during the rollout.
     *
     * Returns null when the token doesn't match either table — caller
     * should `abort(404)` to keep widget URLs from leaking which orgs exist.
     */
    public static function resolveByToken(string $token): ?self
    {
        $brand = static::withoutGlobalScopes()
            ->where('widget_token', $token)
            ->first();

        if (!$brand) {
            // Legacy: orgs.widget_token may still hold the value for orgs
            // whose default brand was created before the new column existed.
            $orgId = Organization::where('widget_token', $token)->value('id');
            if ($orgId) {
                $brand = static::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('is_default', true)
                    ->first();
            }
        }

        if ($brand) {
            app()->instance('current_organization_id', $brand->organization_id);
            app()->instance('current_brand_id', $brand->id);
        }

        return $brand;
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot('role')
            ->withTimestamps();
    }
}
