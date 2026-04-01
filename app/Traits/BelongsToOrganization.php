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
            // Always force organization_id from the current tenant context.
            // This prevents request data from overriding the org (tenant escape).
            if (app()->bound('current_organization_id') && app('current_organization_id')) {
                $model->organization_id = app('current_organization_id');
            }
        });

        static::updating(function ($model) {
            // Prevent changing organization_id on existing records
            if ($model->isDirty('organization_id') && $model->getOriginal('organization_id')) {
                $model->organization_id = $model->getOriginal('organization_id');
            }
        });
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }
}
