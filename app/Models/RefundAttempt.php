<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The audit trail of a refund tried on a stay's payment.
 *
 * Written by BookingRefundService::applyRefund() BEFORE calling Stripe's
 * refund API (and for every refund the `charge.refunded` webhook records),
 * then stamped with the refund id, or the error, and `completed_at`.
 * Release 6: no longer an idempotency gate — the webhook used to skip a
 * refund event within 60 seconds of an attempt; now the refund path and the
 * webhook both write under the payment's refund lock (`refund:{payer}`, in
 * SharedCache) and the webhook records only what Stripe's cumulative total
 * adds. A completed attempt's refund id still tells a refund Stripe hands
 * back for a retry (BookingRefundService::alreadyRecorded()).
 *
 * See the table migration (2026_05_31_130000) for the original race-condition
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
