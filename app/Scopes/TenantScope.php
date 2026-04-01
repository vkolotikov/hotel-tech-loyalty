<?php

namespace App\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Automatically filters queries by the current organization_id.
 * The organization_id is resolved from the authenticated user.
 */
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (!app()->bound('current_organization_id')) {
            // Fail-closed: if no org context is set, return NO results
            // rather than silently returning ALL tenants' data.
            // Use withoutGlobalScopes() explicitly when cross-tenant access is intended.
            $builder->whereRaw('1 = 0');
            return;
        }

        $orgId = app('current_organization_id');

        if ($orgId) {
            $builder->where($model->getTable() . '.organization_id', $orgId);
        } else {
            // Org context is bound but null — fail-closed
            $builder->whereRaw('1 = 0');
        }
    }
}
