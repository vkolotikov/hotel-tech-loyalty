<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServiceBookingSubmission extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'idempotency_key', 'source', 'outcome',
        'service_booking_id', 'customer_email', 'customer_name',
        'request_payload', 'response_payload', 'error_message',
    ];

    protected $casts = [
        'request_payload'  => 'array',
        'response_payload' => 'array',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(ServiceBooking::class, 'service_booking_id');
    }
}
