<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Service extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'category_id', 'name', 'slug', 'description', 'short_description',
        'duration_minutes', 'buffer_after_minutes', 'price', 'currency',
        'image', 'gallery', 'tags', 'sort_order', 'is_active', 'meta',
    ];

    protected $casts = [
        'gallery'              => 'array',
        'tags'                 => 'array',
        'meta'                 => 'array',
        'is_active'            => 'boolean',
        'price'                => 'decimal:2',
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
