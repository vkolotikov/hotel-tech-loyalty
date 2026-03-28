<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Reservation extends Model
{
    protected $fillable = [
        'guest_id', 'inquiry_id', 'corporate_account_id', 'property_id',
        'confirmation_no', 'check_in', 'check_out', 'num_nights', 'num_rooms',
        'num_adults', 'num_children', 'room_type', 'room_number',
        'rate_per_night', 'total_amount', 'meal_plan', 'payment_status', 'payment_method',
        'booking_channel', 'agent_name', 'status', 'source',
        'arrival_time', 'departure_time', 'special_requests',
        'task_type', 'task_due', 'task_urgency', 'task_notes', 'task_completed',
        'checked_in_at', 'checked_out_at', 'cancelled_at', 'notes',
    ];

    protected $casts = [
        'check_in'       => 'date',
        'check_out'      => 'date',
        'task_due'       => 'date',
        'rate_per_night' => 'decimal:2',
        'total_amount'   => 'decimal:2',
        'task_completed' => 'boolean',
        'checked_in_at'  => 'datetime',
        'checked_out_at' => 'datetime',
        'cancelled_at'   => 'datetime',
    ];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(Inquiry::class);
    }

    public function corporateAccount(): BelongsTo
    {
        return $this->belongsTo(CorporateAccount::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
