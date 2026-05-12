<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmailCampaign extends Model
{
    use BelongsToOrganization;

    public const STATUS_DRAFT   = 'draft';
    public const STATUS_SENDING = 'sending';
    public const STATUS_SENT    = 'sent';
    public const STATUS_FAILED  = 'failed';

    protected $fillable = [
        'organization_id', 'segment_id', 'name', 'subject',
        'body_html', 'body_text', 'body_blocks', 'status', 'recipient_count',
        'sent_count', 'failed_count', 'sent_at', 'error_message',
        'created_by_user_id', 'sent_by_user_id',
    ];

    protected $casts = [
        'sent_at'         => 'datetime',
        'recipient_count' => 'integer',
        'sent_count'      => 'integer',
        'failed_count'    => 'integer',
        'body_blocks'     => 'array',
    ];

    public function segment(): BelongsTo
    {
        return $this->belongsTo(MemberSegment::class, 'segment_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }
}
