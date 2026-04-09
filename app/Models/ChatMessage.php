<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    public $timestamps = false;

    protected $fillable = [
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
        'created_at',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

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
