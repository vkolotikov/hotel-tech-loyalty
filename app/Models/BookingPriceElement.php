<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingPriceElement extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'booking_mirror_id', 'reservation_id',
        'remote_price_element_id', 'element_type', 'name',
        'amount', 'quantity', 'tax', 'currency_code', 'sort_order',
        'raw_json', 'synced_at',
    ];

    protected $casts = [
        'amount'    => 'decimal:2',
        'tax'       => 'decimal:2',
        'raw_json'  => 'array',
        'synced_at' => 'datetime',
    ];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(BookingMirror::class, 'booking_mirror_id');
    }
}
