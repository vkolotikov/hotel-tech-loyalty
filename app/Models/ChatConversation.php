<?php

namespace App\Models;

use App\Models\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatConversation extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'member_id',
        'visitor_name',
        'visitor_email',
        'visitor_phone',
        'channel',
        'status',
        'assigned_to',
        'rating',
        'rating_comment',
        'lead_captured',
        'inquiry_id',
        'session_id',
        'messages_count',
        'last_message_at',
    ];

    protected $casts = [
        'lead_captured' => 'boolean',
        'messages_count' => 'integer',
        'rating' => 'integer',
        'last_message_at' => 'datetime',
    ];

    public function messages()
    {
        return $this->hasMany(ChatMessage::class, 'conversation_id');
    }

    public function member()
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function assignedAgent()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function inquiry()
    {
        return $this->belongsTo(Inquiry::class);
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeWaiting($query)
    {
        return $query->where('status', 'waiting');
    }

    public function scopeResolved($query)
    {
        return $query->where('status', 'resolved');
    }

    public function scopeUnassigned($query)
    {
        return $query->whereNull('assigned_to');
    }

    public function getDisplayNameAttribute(): string
    {
        if ($this->member) {
            return $this->member->user->name ?? 'Member';
        }
        return $this->visitor_name ?: 'Visitor';
    }
}
