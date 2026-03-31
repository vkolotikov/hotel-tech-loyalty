<?php

namespace App\Traits;

use App\Models\Organization;
use App\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Apply to any model that has an organization_id column.
 * Automatically scopes queries and sets organization_id on create.
 */
trait BelongsToOrganization
{
    public static function bootBelongsToOrganization(): void
    {
        static::addGlobalScope(new TenantScope());

        static::creating(function ($model) {
            if (empty($model->organization_id)) {
                $model->organization_id = app('current_organization_id');
            }
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
