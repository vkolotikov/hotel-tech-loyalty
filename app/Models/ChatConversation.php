<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
        // External-channel linkage (Phase 1 — Messenger). Null for legacy
        // widget conversations. See MESSENGER_INTEGRATION.md.
        'external_thread_id',
        'channel_account_id',
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
        'marketing_attribution' => 'array',
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

    /** @return BelongsTo<User, $this> */
    public function assignedAgent(): BelongsTo
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

    /**
     * The external channel account this conversation lives on (Messenger
     * Page, future WhatsApp number, etc). NULL for web-widget conversations.
     */
    public function channelAccount()
    {
        return $this->belongsTo(ChatChannelAccount::class, 'channel_account_id');
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

    /**
     * The conversations the inbox lists by default (ChatInboxController::index): the visitor wrote something, left a
     * way to reach them, or became a lead. A widget opened and never written in is not a chat. The inbox's stats and
     * HexaTech CRM's Today count the same ones (2026-11-08), so every figure matches the list.
     */
    public function scopeShownInInbox($query)
    {
        return $query->where(function ($q) {
            $q->whereExists(function ($sub) {
                $sub->select(\Illuminate\Support\Facades\DB::raw(1))
                    ->from('chat_messages')
                    ->whereColumn('chat_messages.conversation_id', 'chat_conversations.id')
                    ->where('chat_messages.sender_type', 'visitor');
            })
            ->orWhereNotNull('chat_conversations.visitor_email')
            ->orWhereNotNull('chat_conversations.visitor_phone')
            ->orWhere('chat_conversations.lead_captured', true);
        });
    }

    public function getDisplayNameAttribute(): string
    {
        if ($this->member) {
            return $this->member->user->name ?? 'Member';
        }
        return $this->visitor_name ?: 'Visitor';
    }
}
