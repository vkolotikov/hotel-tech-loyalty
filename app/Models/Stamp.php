<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One stamp on a member's card (release 7, spec 2026-10-25 §2): the visit that gave it (`source` — appointment, stay,
 * check_in or purchase — and its reference: `service_booking`, `booking_mirror` or `scan_event` with the row's id) and
 * the venue day it counts for. At most one per member per venue day (`stamps_member_day_unique`) and one per reference
 * (`stamps_reference_unique`).
 *
 * `venue_day` is kept as the `Y-m-d` string it is stored as (no date cast: Eloquent would write a time beside it, which
 * SQLite keeps and compares as text). Written only by App\Services\Loyalty\Stamps\StampCards.
 */
class Stamp extends Model
{
    use BelongsToOrganization;

    protected $table = 'stamps';

    /** StampCards writes with forceFill(); nothing reaches a column by mass assignment. */
    protected $guarded = ['*'];

    protected $casts = [
        'stamp_card_id' => 'integer',
        'reference_id'  => 'integer',
        'created_by'    => 'integer',
    ];

    public function card(): BelongsTo
    {
        return $this->belongsTo(StampCard::class, 'stamp_card_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The venue day as `Y-m-d`, whatever the driver handed back (PostgreSQL a date, SQLite the stored text). */
    public function day(): string
    {
        return substr((string) $this->getRawOriginal('venue_day', $this->venue_day), 0, 10);
    }
}
