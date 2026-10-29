<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class BookingExtra extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'description', 'price', 'price_type',
        'lead_time_hours',
        'currency', 'image', 'icon', 'category', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'is_active'       => 'boolean',
        'price'           => 'decimal:2',
        'lead_time_hours' => 'integer',
    ];

    /** A cleared optional preparation time means no wait; the persisted column is non-null. */
    public function setLeadTimeHoursAttribute($value): void
    {
        $this->attributes['lead_time_hours'] = $value === null || $value === '' ? 0 : (int) $value;
    }
}
