<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ServiceExtra extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'description', 'price', 'price_type',
        'duration_minutes', 'lead_time_hours',
        'currency', 'image', 'icon', 'category', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'is_active'        => 'boolean',
        'price'            => 'decimal:2',
        'duration_minutes' => 'integer',
        'lead_time_hours'  => 'integer',
        'sort_order'       => 'integer',
    ];
}
