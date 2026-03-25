<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PushNotification extends Model
{
    protected $fillable = [
        'member_id', 'type', 'title', 'body', 'data',
        'channel', 'campaign_id', 'sent_at', 'read_at', 'is_sent',
    ];

    protected $casts = [
        'data'    => 'array',
        'sent_at' => 'datetime',
        'read_at' => 'datetime',
        'is_sent' => 'boolean',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }
}
