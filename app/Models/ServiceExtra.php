<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ServiceExtra extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'description', 'price', 'price_type',
        'duration_minutes', 'currency', 'image', 'icon', 'category',
        'sort_order', 'is_active',
    ];

    protected $casts = [
        'is_active'        => 'boolean',
        'price'            => 'decimal:2',
        'duration_minutes' => 'integer',
        'sort_order'       => 'integer',
    ];
}
