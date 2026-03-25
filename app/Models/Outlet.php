<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Outlet extends Model
{
    protected $fillable = [
        'property_id', 'name', 'code', 'type', 'earn_rate_override', 'is_active',
    ];

    protected $casts = [
        'earn_rate_override' => 'decimal:2',
        'is_active'          => 'boolean',
    ];

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
