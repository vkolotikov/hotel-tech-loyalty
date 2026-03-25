<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Booking extends Model
{
    protected $fillable = [
        'member_id', 'booking_reference', 'hotel_name', 'room_type',
        'check_in', 'check_out', 'nights', 'total_amount', 'currency',
        'status', 'points_earned', 'points_redeemed', 'source',
        'special_requests', 'rating', 'review', 'webhook_payload',
    ];

    protected $casts = [
        'check_in' => 'date',
        'check_out' => 'date',
        'total_amount' => 'decimal:2',
        'webhook_payload' => 'array',
    ];

    public function member()
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }
}
