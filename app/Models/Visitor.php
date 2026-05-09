<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Persistent identity for everyone hitting the chat widget. One visitor row
 * spans many ChatConversation rows (different sessions/tabs/days).
 */
class Visitor extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'visitor_key',
        'visitor_ip',
        'user_agent',
        'country',
        'city',
        'referrer',
        'current_page',
        'current_page_title',
        'first_seen_at',
        'last_seen_at',
        'visit_count',
        'page_views_count',
        'messages_count',
        'is_lead',
        'guest_id',
        'display_name',
        'email',
        'phone',
    ];

    protected $casts = [
        'first_seen_at'    => 'datetime',
        'last_seen_at'     => 'datetime',
        'visit_count'      => 'integer',
        'page_views_count' => 'integer',
        'messages_count'   => 'integer',
        'is_lead'          => 'boolean',
    ];

    protected $appends = ['is_online'];

    /** Online if last heartbeat / activity within the last 90 seconds. */
    public function getIsOnlineAttribute(): bool
    {
        return $this->last_seen_at && $this->last_seen_at->gt(now()->subSeconds(90));
    }

    public function pageViews(): HasMany
    {
        return $this->hasMany(VisitorPageView::class)->orderByDesc('viewed_at');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(ChatConversation::class)->orderByDesc('last_message_at');
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(Guest::class);
    }
}
