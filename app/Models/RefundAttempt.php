<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pending marker for an in-flight Stripe refund.
 *
 * Written by BookingRefundService::applyRefund() BEFORE calling
 * Stripe's refund API. Read by BookingPublicController's
 * `charge.refunded` webhook handler as the idempotency gate: if a
 * refund_attempt row younger than 60 seconds exists for the same
 * (mirror_id, payment_intent_id), the admin flow is still wrapping up
 * (Smoobu cancel, points reversal, email) — the webhook returns 200
 * no-op so we don't double-apply the side effects.
 *
 * See the table migration (2026_05_31_130000) for the full race-condition
 * write-up.
 */
class RefundAttempt extends Model
{
    use BelongsToOrganization;

    protected $table = 'refund_attempts';

    protected $fillable = [
        'organization_id',
        'mirror_id',
        'payment_intent_id',
        'refund_id',
        'requested_at',
        'completed_at',
        'error',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function mirror(): BelongsTo
    {
        return $this->belongsTo(BookingMirror::class, 'mirror_id');
    }
}
