<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Traits\BelongsToOrganization;

class Inquiry extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'guest_id', 'corporate_account_id', 'property_id', 'inquiry_type', 'source',
        'check_in', 'check_out', 'num_nights', 'num_rooms', 'num_adults', 'num_children',
        'room_type_requested', 'rate_offered', 'total_value', 'status', 'priority',
        'assigned_to', 'special_requests',
        'event_type', 'event_name', 'event_pax', 'function_space', 'catering_required', 'av_required',
        'next_task_type', 'next_task_due', 'next_task_notes', 'next_task_completed',
        'phone_calls_made', 'emails_sent', 'last_contacted_at', 'last_contact_comment', 'notes',
    ];

    protected $casts = [
        'check_in'            => 'date',
        'check_out'           => 'date',
        'next_task_due'       => 'date',
        'last_contacted_at'   => 'date',
        'next_task_completed' => 'boolean',
        'catering_required'   => 'boolean',
        'av_required'         => 'boolean',
        'rate_offered'        => 'decimal:2',
        'total_value'         => 'decimal:2',
    ];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function corporateAccount(): BelongsTo
    {
        return $this->belongsTo(CorporateAccount::class);
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(Reservation::class);
    }
}
