<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * Event-id dedup row for Stripe webhooks.
 * Insert-then-23505-skip pattern. See StripeService::dedupWebhookEvent().
 *
 * Mirrors the existing SmoobuWebhookEvent model.
 */
class StripeWebhookEvent extends Model
{
    use BelongsToOrganization;

    protected $table = 'stripe_webhook_events';

    protected $fillable = [
        'organization_id',
        'event_id',
        'event_type',
        'payment_intent_id',
        'charge_id',
        'received_at',
    ];

    protected $casts = [
        'received_at' => 'datetime',
    ];
}
