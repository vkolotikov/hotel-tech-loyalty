<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Property extends Model
{
    protected $fillable = [
        'organization_id', 'name', 'code', 'email', 'phone', 'image_url',
        'address', 'city', 'country', 'timezone', 'currency', 'star_rating',
        'room_count', 'pms_type', 'pms_property_id', 'settings', 'is_active',
    ];

    protected $casts = [
        'settings'   => 'array',
        'is_active'  => 'boolean',
        'room_count' => 'integer',
    ];

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function outlets(): HasMany
    {
        return $this->hasMany(Outlet::class);
    }

    public function staff(): HasMany
    {
        return $this->hasMany(Staff::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }
}
