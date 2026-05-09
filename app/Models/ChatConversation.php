<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class ChatConversation extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'member_id',
        'visitor_id',
        'visitor_name',
        'visitor_email',
        'visitor_phone',
        'visitor_ip',
        'visitor_country',
        'visitor_city',
        'visitor_user_agent',
        'page_url',
        'channel',
        'status',
        'ai_enabled',
        'assigned_to',
        'rating',
        'rating_comment',
        'agent_notes',
        'lead_captured',
        'inquiry_id',
        'session_id',
        'messages_count',
        'last_message_at',
        'visitor_typing_until',
        'agent_typing_until',
        'active_agent_name',
        'active_agent_avatar',
        'rating_requested',
        // Engagement Hub Phase 3 — see ENGAGEMENT_HUB_PLAN.md
        'intent_tag',
        'ai_brief',
        'ai_brief_at',
    ];

    protected $casts = [
        'lead_captured' => 'boolean',
        'ai_enabled' => 'boolean',
        'messages_count' => 'integer',
        'rating' => 'integer',
        'last_message_at' => 'datetime',
        'visitor_typing_until' => 'datetime',
        'agent_typing_until' => 'datetime',
        'rating_requested' => 'boolean',
        'ai_brief_at' => 'datetime',
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

    public function visitor()
    {
        return $this->belongsTo(Visitor::class, 'visitor_id');
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
