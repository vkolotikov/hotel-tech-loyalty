<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class BookingIdempotencyKey extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'idempotency_key', 'request_hash',
        'response_json', 'status_code', 'expires_at',
    ];

    protected $casts = [
        'response_json' => 'array',
        'expires_at'    => 'datetime',
    ];

    public function isValid(): bool
    {
        return $this->expires_at->isFuture();
    }
}
