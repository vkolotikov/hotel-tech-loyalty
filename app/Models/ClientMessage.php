<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** One client message the appointments sender decided on (Part D). */
class ClientMessage extends Model
{
    use BelongsToOrganization;

    public const KINDS = ['booked', 'moved', 'confirmed', 'cancelled', 'reminder'];

    protected $fillable = [
        'organization_id', 'service_booking_id', 'kind', 'channel', 'recipient', 'locale', 'status', 'reason',
        'for_start_at', 'previous_start_at', 'actor_user_id', 'sent_at',
    ];

    protected $casts = [
        'for_start_at'      => 'datetime',
        'previous_start_at' => 'datetime',
        'sent_at'           => 'datetime',
    ];

    /** What the screens show: what happened, never what was written. `at` is a real instant (UTC). */
    public function toApi(): array
    {
        return [
            'kind'      => (string) $this->kind,
            'status'    => (string) $this->status,
            'reason'    => $this->reason,
            'recipient' => $this->recipient,
            'at'        => $this->created_at?->toIso8601String(),
        ];
    }
}
