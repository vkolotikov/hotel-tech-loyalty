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
        $promotionExpiry = $this->payload_json['promotion_expires_at'] ?? null;
        return $this->status === 'active' && $this->expires_at->isFuture()
            && (!$promotionExpiry || \Carbon\CarbonImmutable::parse($promotionExpiry)->isFuture());
    }

    public function paymentExpiry(\Carbon\CarbonInterface $candidate): \Carbon\CarbonInterface
    {
        $deadline = $this->payload_json['promotion_expires_at'] ?? null;
        return $deadline ? $candidate->min(\Carbon\CarbonImmutable::parse($deadline)) : $candidate;
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active')->where('expires_at', '>', now());
    }
}
