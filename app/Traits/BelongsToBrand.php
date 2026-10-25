<?php

namespace App\Traits;

use App\Models\Brand;
use App\Scopes\BrandScope;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Apply to any model that has a `brand_id` column AND should filter queries
 * to the currently-bound brand context.
 *
 * Pairs with BelongsToOrganization — a brand-scoped model is also tenant-
 * scoped because brand always lives inside an organization. The two scopes
 * compose: TenantScope first ensures org isolation, BrandScope further
 * narrows when a specific brand is selected.
 */
trait BelongsToBrand
{
    public static function bootBelongsToBrand(): void
    {
        static::addGlobalScope(new BrandScope());

        static::creating(function ($model) {
            // Only fill brand_id if the caller hasn't already chosen one.
            // The middleware-bound brand applies as the default when an admin
            // is operating inside a brand-scoped view.
            if (!empty($model->brand_id)) {
                return;
            }

            if (app()->bound('current_brand_id') && app('current_brand_id')) {
                $model->brand_id = app('current_brand_id');
                return;
            }

            // A model whose empty brand means "every brand" (EVERY_BRAND_WHEN_EMPTY:
            // campaigns and offers, owner 2026-10-25) keeps it empty; BrandScope
            // shows such a row in every brand's view.
            if (self::everyBrandWhenEmpty($model)) {
                return;
            }

            // Defense-in-depth: when no brand context is bound (admin
            // operating in "All brands" mode, console commands, queue jobs)
            // AND the row has an organization_id, fall back to that org's
            // default brand. Without this fallback, rows created in "All
            // brands" mode get brand_id=NULL and become invisible the
            // moment the admin filters by a specific brand.
            $orgId = $model->organization_id
                ?? (app()->bound('current_organization_id') ? app('current_organization_id') : null);
            if ($orgId) {
                $defaultBrandId = Brand::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('is_default', true)
                    ->whereNull('deleted_at')
                    ->value('id');
                if ($defaultBrandId) {
                    $model->brand_id = $defaultBrandId;
                }
            }
        });
    }

    /**
     * Whether $model declares that an empty `brand_id` means every brand of the organisation (the constant
     * EVERY_BRAND_WHEN_EMPTY = true): no default brand is filled in for it, and BrandScope shows it under every brand.
     */
    public static function everyBrandWhenEmpty(object $model): bool
    {
        $constant = $model::class . '::EVERY_BRAND_WHEN_EMPTY';

        return defined($constant) && constant($constant) === true;
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }
}
