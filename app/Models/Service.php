<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Service extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'category_id', 'name', 'slug', 'description', 'short_description',
        'duration_minutes', 'buffer_after_minutes', 'price', 'currency',
        // The menu row's own "starting price" mark ("From €48") and service
        // window ("Fri–Sun · 12:00"), printed per row by the landing menus.
        'price_is_from', 'service_window',
        'image', 'gallery', 'tags', 'sort_order', 'is_active', 'meta',
    ];

    protected $casts = [
        'gallery'              => 'array',
        'tags'                 => 'array',
        'meta'                 => 'array',
        'is_active'            => 'boolean',
        'price'                => 'decimal:2',
        'price_is_from'        => 'boolean',
        'duration_minutes'     => 'integer',
        'buffer_after_minutes' => 'integer',
        'sort_order'           => 'integer',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(ServiceCategory::class, 'category_id');
    }

    public function masters(): BelongsToMany
    {
        return $this->belongsToMany(ServiceMaster::class, 'service_master_service')
            ->withPivot(['price_override', 'duration_override_minutes'])
            ->withTimestamps();
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(ServiceBooking::class);
    }
}
