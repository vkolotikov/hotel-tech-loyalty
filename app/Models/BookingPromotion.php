<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * @property \Carbon\CarbonImmutable|null $booking_from
 * @property \Carbon\CarbonImmutable|null $booking_until
 * @property list<int>|null $room_ids
 * @property list<array{from: string, until: string}>|null $excluded_dates
 */
class BookingPromotion extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const EVERY_BRAND_WHEN_EMPTY = true;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['value' => 'float', 'booking_from' => 'immutable_datetime', 'booking_until' => 'immutable_datetime',
            'excluded_dates' => 'array', 'room_ids' => 'array', 'min_nights' => 'integer', 'revision' => 'integer'];
    }
}
