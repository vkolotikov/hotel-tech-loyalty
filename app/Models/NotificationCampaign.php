<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationCampaign extends Model
{
    protected $fillable = [
        'property_id', 'name', 'segment_rules', 'title', 'body', 'data',
        'channel', 'email_template_id', 'email_subject', 'email_sent_count',
        'scheduled_at', 'sent_at', 'target_count', 'sent_count',
        'opened_count', 'status', 'created_by',
    ];

    protected $casts = [
        'segment_rules' => 'array',
        'data'          => 'array',
        'scheduled_at'  => 'datetime',
        'sent_at'       => 'datetime',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
