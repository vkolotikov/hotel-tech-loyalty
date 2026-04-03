<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class BookingRoom extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'pms_id', 'name', 'slug', 'description', 'short_description',
        'max_guests', 'bedrooms', 'bed_type', 'base_price', 'currency',
        'image', 'gallery', 'amenities', 'tags', 'size',
        'sort_order', 'is_active', 'meta',
    ];

    protected $casts = [
        'gallery'   => 'array',
        'amenities' => 'array',
        'tags'      => 'array',
        'meta'      => 'array',
        'is_active' => 'boolean',
        'base_price' => 'decimal:2',
    ];

    public function extras()
    {
        return BookingExtra::where('organization_id', $this->organization_id)->where('is_active', true)->orderBy('sort_order')->get();
    }
}
