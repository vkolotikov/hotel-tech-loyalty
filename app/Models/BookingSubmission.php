<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingSubmission extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'request_id', 'idempotency_key', 'outcome',
        'failure_code', 'failure_message', 'booking_reference', 'reservation_id',
        'guest_id', 'guest_name', 'guest_email', 'guest_phone',
        'unit_id', 'unit_name', 'check_in', 'check_out',
        'adults', 'children', 'gross_total',
        'payment_method', 'payment_status', 'payload_json',
    ];

    protected $casts = [
        'check_in'     => 'date',
        'check_out'    => 'date',
        'gross_total'  => 'decimal:2',
        'payload_json' => 'array',
    ];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }
}
