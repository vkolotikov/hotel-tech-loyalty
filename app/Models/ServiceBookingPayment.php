<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One payment taken or refund given for a service booking (Part E). Never edited or deleted. */
class ServiceBookingPayment extends Model
{
    use BelongsToOrganization;

    public const KINDS = ['payment', 'refund'];

    public const DESK_METHODS = ['cash', 'card_desk', 'transfer', 'other'];

    protected $fillable = [
        'organization_id', 'service_booking_id', 'kind', 'method', 'amount', 'currency', 'note', 'corrects', 'stripe_refund_id', 'actor_user_id',
    ];

    /** `corrects`: a desk refund undoing a wrong entry — the money is owed again (a goodwill refund is not). */
    protected $casts = ['amount' => 'float', 'corrects' => 'boolean'];

    public function booking(): BelongsTo
    {
        return $this->belongsTo(ServiceBooking::class, 'service_booking_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    /** What the screens show. `at` is a real instant (UTC). */
    public function toApi(): array
    {
        return [
            'id'       => (int) $this->id,
            'kind'     => (string) $this->kind,
            'method'   => (string) $this->method,
            'amount'   => round((float) $this->amount, 2),
            'currency' => (string) $this->currency,
            'note'     => $this->note,
            'corrects' => (bool) $this->corrects,
            'by'       => $this->actor?->name,
            'at'       => $this->created_at?->toIso8601String(),
        ];
    }
}
