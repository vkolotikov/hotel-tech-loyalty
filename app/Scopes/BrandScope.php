<?php

namespace App\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Filters queries by `current_brand_id` when a brand context is bound.
 *
 * Behaviour differs from TenantScope on purpose:
 *  - Tenant safety is provided by TenantScope; brand is a *softer* scope.
 *  - When no brand is bound at all (console commands, scheduled jobs, the
 *    "All brands" admin SPA mode), this scope NO-OPs and lets the org-level
 *    scope continue to filter. That preserves existing behaviour for every
 *    code path that hasn't been brand-aware'd yet.
 *  - When brand is bound to a non-null id, queries filter by that brand.
 *  - When brand is bound to null explicitly, that's the SPA's "All brands"
 *    selection — also a no-op so admins see everything in the org.
 *
 * Use `Model::withoutGlobalScope(BrandScope::class)` only when you intentionally
 * need to bypass brand filtering inside a brand-aware code path.
 */
class BrandScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (!app()->bound('current_brand_id')) {
            return;
        }

        $brandId = app('current_brand_id');

        if ($brandId) {
            $builder->where($model->getTable() . '.brand_id', $brandId);
        }
    }
}
