<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A member checked in at an event (release 8, spec 2026-10-25 §4): once per member per event, when and by whom, whether
 * they came without signing up (`walk_in`), the scan and the points line it wrote. Written only by
 * App\Services\Loyalty\Events\EventCheckIn.
 */
class EventAttendance extends Model
{
    use BelongsToOrganization;

    protected $table = 'loyalty_event_attendances';

    protected $guarded = ['*'];

    protected $casts = [
        'checked_in_at'         => 'datetime',
        'walk_in'               => 'boolean',
        'scan_event_id'         => 'integer',
        'points_transaction_id' => 'integer',
    ];

    public function event(): BelongsTo
    {
        return $this->belongsTo(LoyaltyEvent::class, 'loyalty_event_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }
}
