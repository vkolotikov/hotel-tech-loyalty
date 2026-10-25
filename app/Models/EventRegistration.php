<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A member's sign-up for an event (release 8, spec 2026-10-25 §4): `signed_up` or `cancelled`, from the `portal` or by
 * `staff`; one row per member per event (a cancelled sign-up is signed up again on the same row). Written only by
 * App\Services\Loyalty\Events\EventSignUp.
 */
class EventRegistration extends Model
{
    use BelongsToOrganization;

    public const SIGNED_UP = 'signed_up';
    public const CANCELLED = 'cancelled';

    protected $table = 'loyalty_event_registrations';

    protected $guarded = ['*'];

    protected $casts = [
        'signed_up_at' => 'datetime',
        'cancelled_at' => 'datetime',
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
