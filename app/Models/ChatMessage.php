<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    use BelongsToOrganization;

    public $timestamps = false;

    protected $fillable = [
        'organization_id',
        'conversation_id',
        'sender_type',
        'sender_user_id',
        'content',
        'content_type',
        'is_read',
        'metadata',
        'client_id',
        'attachment_url',
        'attachment_type',
        'attachment_size',
        // External-channel linkage (Phase 1 — Messenger). channel_message_id
        // is Meta's mid.* used for idempotency; direction is the cheaper-
        // to-filter form of (sender_type=visitor → inbound, else outbound).
        // attachments_data carries normalised attachment metadata that
        // outlives the raw webhook `metadata` blob. channel_account_id
        // scopes the idempotency dedup so two Pages reusing the same Meta
        // mid namespace never collide (also backs the partial unique index
        // chat_messages_channel_dedup_unique).
        'channel_account_id',
        'channel_message_id',
        'direction',
        'attachments_data',
        'created_at',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'metadata' => 'array',
        'attachments_data' => 'array',
        'created_at' => 'datetime',
    ];

    public const DIRECTION_INBOUND  = 'inbound';
    public const DIRECTION_OUTBOUND = 'outbound';

    public function conversation()
    {
        return $this->belongsTo(ChatConversation::class, 'conversation_id');
    }

    public function senderUser()
    {
        return $this->belongsTo(User::class, 'sender_user_id');
    }

    public function scopeFromVisitor($query)
    {
        return $query->where('sender_type', 'visitor');
    }

    public function scopeFromAi($query)
    {
        return $query->where('sender_type', 'ai');
    }

    public function scopeFromAgent($query)
    {
        return $query->where('sender_type', 'agent');
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }
}
