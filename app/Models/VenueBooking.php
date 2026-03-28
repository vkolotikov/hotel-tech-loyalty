<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VenueBooking extends Model
{
    protected $fillable = [
        'venue_id', 'guest_id', 'corporate_account_id',
        'booking_date', 'start_time', 'end_time',
        'event_name', 'event_type', 'attendees', 'setup_style',
        'catering_required', 'av_required', 'special_requirements',
        'contact_name', 'contact_phone', 'contact_email',
        'rate_charged', 'status', 'notes',
    ];

    protected $casts = [
        'booking_date'      => 'date',
        'catering_required' => 'boolean',
        'av_required'       => 'boolean',
        'rate_charged'      => 'decimal:2',
    ];

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function corporateAccount(): BelongsTo
    {
        return $this->belongsTo(CorporateAccount::class);
    }
}
