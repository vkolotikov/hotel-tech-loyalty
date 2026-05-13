<?php

namespace App\Models;

use App\Scopes\IntegrationDataScope;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BookingMirror extends Model
{
    use BelongsToOrganization;

    protected $table = 'booking_mirror';

    protected static function booted(): void
    {
        static::addGlobalScope(new IntegrationDataScope('smoobu'));
    }

    protected $fillable = [
        'organization_id', 'reservation_id', 'booking_reference', 'booking_type',
        'booking_state', 'apartment_id', 'apartment_name', 'channel_id', 'channel_name',
        'guest_id', 'guest_name', 'guest_email', 'guest_phone', 'guest_language',
        'adults', 'children', 'arrival_date', 'departure_date',
        'check_in_time', 'check_out_time',
        'price_total', 'price_paid', 'prepayment_amount', 'prepayment_paid',
        'deposit_amount', 'deposit_paid',
        'refunded_amount', 'refunded_at', 'last_refund_id',
        'notice', 'assistant_notice', 'guest_app_url',
        'payment_method', 'payment_status', 'stripe_payment_intent_id', 'internal_status', 'invoice_state',
        'source_created_at', 'source_updated_at', 'synced_at', 'lifecycle_counted_at', 'raw_json',
        'pms_sync_attempts', 'pms_sync_last_attempt_at', 'pms_sync_last_error',
    ];

    protected $casts = [
        'arrival_date'      => 'date',
        'departure_date'    => 'date',
        'price_total'       => 'decimal:2',
        'price_paid'        => 'decimal:2',
        'refunded_amount'   => 'decimal:2',
        'refunded_at'       => 'datetime',
        'prepayment_amount' => 'decimal:2',
        'prepayment_paid'   => 'boolean',
        'deposit_amount'    => 'decimal:2',
        'deposit_paid'      => 'boolean',
        'source_created_at' => 'datetime',
        'source_updated_at' => 'datetime',
        'synced_at'         => 'datetime',
        'lifecycle_counted_at' => 'datetime',
        'pms_sync_last_attempt_at' => 'datetime',
        'raw_json'          => 'array',
    ];

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }

    public function priceElements(): HasMany
    {
        return $this->hasMany(BookingPriceElement::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(BookingNote::class)->orderByDesc('created_at');
    }
}
