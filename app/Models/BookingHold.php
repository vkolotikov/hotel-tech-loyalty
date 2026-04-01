<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class BookingHold extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'hold_token', 'status', 'expires_at', 'payload_json',
    ];

    protected $casts = [
        'expires_at'    => 'datetime',
        'payload_json'  => 'array',
    ];

    public function isActive(): bool
    {
        return $this->status === 'active' && $this->expires_at->isFuture();
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active')->where('expires_at', '>', now());
    }
}
