<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceBookingExtra extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'service_booking_id', 'service_extra_id',
        'name', 'unit_price', 'quantity', 'line_total',
    ];

    protected $casts = [
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'quantity'   => 'integer',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(ServiceBooking::class, 'service_booking_id');
    }

    public function extra(): BelongsTo
    {
        return $this->belongsTo(ServiceExtra::class, 'service_extra_id');
    }
}
