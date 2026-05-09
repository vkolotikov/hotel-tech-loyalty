<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceCategory extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'slug', 'description',
        'icon', 'image', 'color', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'sort_order' => 'integer',
    ];

    public function services(): HasMany
    {
        return $this->hasMany(Service::class, 'category_id');
    }
}
