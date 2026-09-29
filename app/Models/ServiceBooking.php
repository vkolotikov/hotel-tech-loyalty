<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class ServiceBooking extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'booking_reference',
        'service_id', 'service_master_id', 'guest_id', 'member_id',
        'customer_name', 'customer_email', 'customer_phone', 'party_size',
        'start_at', 'end_at', 'duration_minutes',
        'service_price', 'extras_total', 'total_amount', 'currency',
        'list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label',
        'status', 'payment_status', 'stripe_payment_intent_id',
        'source', 'customer_notes', 'staff_notes',
        'cancelled_at', 'cancellation_reason', 'meta', 'points_awarded_at',
        'refunded_amount', 'refunded_at', 'last_refund_id',
    ];

    protected $casts = [
        'start_at'          => 'datetime',
        'end_at'            => 'datetime',
        'cancelled_at'      => 'datetime',
        'meta'              => 'array',
        'service_price'     => 'decimal:2',
        'extras_total'      => 'decimal:2',
        'total_amount'      => 'decimal:2',
        'list_amount'       => 'decimal:2',
        'discount_amount'   => 'decimal:2',
        'points_awarded_at' => 'datetime',
        'refunded_amount'   => 'decimal:2',
        'refunded_at'       => 'datetime',
        'duration_minutes'  => 'integer',
        'party_size'        => 'integer',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $booking) {
            if (empty($booking->booking_reference)) {
                $booking->booking_reference = self::generateReference();
            }
        });
    }

    public static function generateReference(): string
    {
        do {
            $ref = 'SVC-' . strtoupper(Str::random(8));
        } while (self::withoutGlobalScopes()->where('booking_reference', $ref)->exists());
        return $ref;
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function master(): BelongsTo
    {
        return $this->belongsTo(ServiceMaster::class, 'service_master_id');
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function extras(): HasMany
    {
        return $this->hasMany(ServiceBookingExtra::class);
    }

    public function isActive(): bool
    {
        return in_array($this->status, ['pending', 'confirmed', 'in_progress'], true);
    }
}
