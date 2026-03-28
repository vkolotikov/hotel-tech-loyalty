<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Venue extends Model
{
    protected $fillable = [
        'property_id', 'name', 'venue_type', 'capacity',
        'hourly_rate', 'half_day_rate', 'full_day_rate',
        'amenities', 'floor', 'area_sqm', 'is_active', 'description',
    ];

    protected $casts = [
        'amenities'     => 'array',
        'is_active'     => 'boolean',
        'hourly_rate'   => 'decimal:2',
        'half_day_rate' => 'decimal:2',
        'full_day_rate' => 'decimal:2',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(VenueBooking::class);
    }
}
