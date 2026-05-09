<?php

namespace App\Services;

use App\Models\ChatConversation;
use App\Models\Visitor;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Backs the new Engagement Hub page (admin SPA `/engagement`).
 *
 * Replaces the split between Inbox + Visitors with a single unified feed
 * where each row corresponds to one visitor identity, augmented with their
 * latest conversation data. The smart-priority sort surfaces the rows
 * that matter most (online with an unread message, then leads, then
 * lower-signal rows) without the agent having to pick filters.
 *
 * See apps/loyalty/ENGAGEMENT_HUB_PLAN.md for the full architecture.
 */
class EngagementFeedService
{
    /** Visitor counts as "online" if last_seen_at is within this window. */
    public const ONLINE_THRESHOLD_SECONDS = 90;

    /** Recently-active threshold for the "+50 priority boost". */
    private const RECENT_ACTIVITY_HOURS = 24;

    /**
     * Build the feed for an org with the given filter / sort / pagination.
     *
     * @param array{
     *   filter?: string,
     *   search?: string,
     *   sort?: string,
     *   page?: int,
     *   per_page?: int,
     * } $params
     */
    public function feed(int $orgId, array $params = []): LengthAwarePaginator
    {
        $threshold = now()->subSeconds(self::ONLINE_THRESHOLD_SECONDS);

        $query = Visitor::query()
            ->where('organization_id', $orgId)
            // Lightweight eager loads — just enough to render the row. The
            // detail drawer fetches the full conversation / journey separately.
            // ChatConversation doesn't have last_message_preview / sender on
            // the table itself, so we eager-load the latest message via the
            // messages relation; same for the unread count.
            ->with([
                'guest:id,full_name,email,phone,lifecycle_status',
                'conversations' => fn ($q) => $q
                    ->select(['id', 'visitor_id', 'status', 'last_message_at',
                              'lead_captured', 'ai_enabled', 'assigned_to', 'messages_count'])
                    ->latest('last_message_at')
                    ->limit(1)
                    ->with(['messages' => fn ($qq) => $qq
                        ->select(['id', 'conversation_id', 'sender_type', 'content', 'is_read', 'created_at'])
                        ->latest('created_at')
                        ->limit(1)])
                    ->withCount(['messages as unread_admin_count' => fn ($qq) => $qq
                        ->where('sender_type', 'visitor')
                        ->where('is_read', false)]),
            ]);

        $this->applyFilter($query, $params['filter'] ?? 'priority', $threshold);
        $this->applySearch($query, $params['search'] ?? '');

        // Sort happens in two steps: SQL pulls a candidate set in a roughly-
        // ordered fashion (DESC by last_seen so paginating works at scale),
        // then we score each row in PHP and re-sort the page.
        // For very large orgs (>10k visitors), the priority score can be
        // pushed into a generated column or materialised view; deferred.
        $query->orderByDesc('last_seen_at');

        $perPage = max(10, min(200, (int) ($params['per_page'] ?? 50)));
        $page = max(1, (int) ($params['page'] ?? 1));

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        // Score + transform to row DTOs.
        $rows = collect($paginator->items())
            ->map(fn (Visitor $v) => $this->toRow($v, $threshold));

        // Re-sort the current page by priority when the smart-sort is active.
        // The user gave us "smart-priority sort with everything" as the default
        // (decision #2 in ENGAGEMENT_HUB_PLAN.md), so this is the hot path.
        $sort = $params['sort'] ?? 'priority';
        if ($sort === 'priority') {
            $rows = $rows->sortByDesc('priority_score')->values();
        } elseif ($sort === 'engagement') {
            $rows = $rows->sortByDesc(fn ($r) => $r['page_views_count'] + $r['messages_count'] * 5)->values();
        }
        // 'recent' is already SQL-sorted by last_seen_at desc — no PHP re-sort.

        // Replace the paginator's items with the scored rows so the paginator
        // metadata (current_page, last_page, total) is correct.
        return new LengthAwarePaginator(
            $rows,
            $paginator->total(),
            $paginator->perPage(),
            $paginator->currentPage(),
            ['path' => $paginator->path()],
        );
    }

    /**
     * Top-of-page KPI numbers. Single roundtrip with a few targeted aggregates
     * to avoid the N+1 trap.
     */
    public function kpis(int $orgId): array
    {
        $threshold = now()->subSeconds(self::ONLINE_THRESHOLD_SECONDS);
        $todayStart = now()->startOfDay();
        $hourAgo = now()->subHour();

        // Visitors KPIs in one row.
        $visitorStats = Visitor::query()
            ->where('organization_id', $orgId)
            ->selectRaw(
                'COUNT(*) AS total,
                 SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) AS online_now,
                 SUM(CASE WHEN is_lead = true THEN 1 ELSE 0 END) AS total_leads,
                 SUM(CASE WHEN is_lead = true AND last_seen_at >= ? THEN 1 ELSE 0 END) AS leads_last_hour',
                [$threshold, $hourAgo],
            )
            ->first();

        // Conversation KPIs in another row.
        $convStats = ChatConversation::query()
            ->where('organization_id', $orgId)
            ->selectRaw(
                "COUNT(*) AS total,
                 SUM(CASE WHEN status = 'active' AND assigned_to IS NULL AND ai_enabled = false THEN 1 ELSE 0 END) AS unanswered,
                 SUM(CASE WHEN status = 'resolved' AND updated_at >= ? THEN 1 ELSE 0 END) AS resolved_today,
                 SUM(CASE WHEN status = 'resolved' AND ai_enabled = true AND assigned_to IS NULL AND updated_at >= ? THEN 1 ELSE 0 END) AS ai_handled_today",
                [$todayStart, $todayStart],
            )
            ->first();

        // Active chat = currently open conversation.
        $activeChats = ChatConversation::query()
            ->where('organization_id', $orgId)
            ->whereIn('status', ['active', 'waiting'])
            ->count();

        $aiResolutionRate = $convStats->resolved_today > 0
            ? (int) round(((int) $convStats->ai_handled_today / (int) $convStats->resolved_today) * 100)
            : 0;

        return [
            'online_now' => [
                'value'  => (int) ($visitorStats->online_now ?? 0),
                'detail' => "{$activeChats} active chat" . ($activeChats === 1 ? '' : 's'),
            ],
            'hot_leads' => [
                'value'  => (int) ($visitorStats->total_leads ?? 0),
                'detail' => '+' . (int) ($visitorStats->leads_last_hour ?? 0) . ' last hour',
            ],
            'unanswered' => [
                'value'  => (int) ($convStats->unanswered ?? 0),
                'detail' => 'awaiting human reply',
            ],
            'ai_handled' => [
                'value'  => (int) ($convStats->ai_handled_today ?? 0),
                'detail' => "{$aiResolutionRate}% AI resolution rate today",
            ],
        ];
    }

    /* ─── filter / search ──────────────────────────────────────────────── */

    private function applyFilter($query, string $filter, \Carbon\Carbon $threshold): void
    {
        switch ($filter) {
            case 'online':
                $query->where('last_seen_at', '>=', $threshold);
                break;
            case 'has_contact':
                $query->where(function ($q) {
                    $q->whereNotNull('email')->orWhereNotNull('phone')->orWhere('is_lead', true);
                });
                break;
            case 'active_chat':
                $query->whereHas('conversations', fn ($q) => $q->whereIn('status', ['active', 'waiting']));
                break;
            case 'hot_lead':
                // Phase 3 will wire a richer "hot lead" rule. For Phase 1 this
                // is a leads + online combo as a useful approximation.
                $query->where('is_lead', true)->where('last_seen_at', '>=', $threshold);
                break;
            case 'anonymous':
                $query->whereNull('email')->whereNull('phone')->where('is_lead', false);
                break;
            case 'resolved':
                $query->whereHas('conversations', fn ($q) => $q->where('status', 'resolved'));
                break;
            case 'priority':
            case 'all':
            default:
                // Smart-priority default: hide pure-anonymous offline browsers
                // by default (decision #4 in ENGAGEMENT_HUB_PLAN.md). Anonymous
                // browsers are still reachable via the "Anonymous" filter chip.
                $query->where(function ($q) use ($threshold) {
                    $q->where('last_seen_at', '>=', $threshold)
                      ->orWhere('is_lead', true)
                      ->orWhereNotNull('email')
                      ->orWhereNotNull('phone')
                      ->orWhereHas('conversations', fn ($c) => $c->whereNotNull('last_message_at'));
                });
                break;
        }
    }

    private function applySearch($query, string $search): void
    {
        if (!$search) {
            return;
        }
        $query->where(function ($q) use ($search) {
            $q->where('display_name', 'ILIKE', "%{$search}%")
              ->orWhere('email',        'ILIKE', "%{$search}%")
              ->orWhere('phone',        'ILIKE', "%{$search}%")
              ->orWhere('visitor_ip',   'ILIKE', "%{$search}%")
              ->orWhere('city',         'ILIKE', "%{$search}%")
              ->orWhere('current_page', 'ILIKE', "%{$search}%");
        });
    }

    /* ─── row transformation + scoring ────────────────────────────────── */

    private function toRow(Visitor $v, \Carbon\Carbon $threshold): array
    {
        $isOnline = $v->last_seen_at && $v->last_seen_at->gte($threshold);
        $hasEmail = !empty($v->email) || !empty($v->guest?->email);
        $hasPhone = !empty($v->phone) || !empty($v->guest?->phone);
        $hasContact = $hasEmail || $hasPhone;

        $conversation = $v->conversations->first();
        $lastMessage = $conversation?->messages?->first();
        $hasActiveChat = $conversation && in_array($conversation->status, ['active', 'waiting'], true);
        $unreadCount = $conversation?->unread_admin_count ?? 0;
        $waitingForHuman = $conversation
            && $conversation->status === 'active'
            && empty($conversation->assigned_to)
            && $lastMessage?->sender_type === 'visitor'
            && $conversation->ai_enabled === false;

        $score = $this->scoreRow(
            isOnline:        $isOnline,
            hasContact:      $hasContact,
            hasUnreadVisitor: $waitingForHuman || $unreadCount > 0,
            hasActiveChat:   $hasActiveChat,
            isLead:          (bool) $v->is_lead,
            lastSeenAt:      $v->last_seen_at,
            conversation:    $conversation,
            lastMessage:     $lastMessage,
        );

        return [
            'id'                  => $v->id,
            'visitor_key'         => $v->visitor_key,
            'display_name'        => $v->display_name,
            'effective_name'      => $this->effectiveName($v),
            'email'               => $v->email ?: $v->guest?->email,
            'phone'               => $v->phone ?: $v->guest?->phone,
            'has_email'           => $hasEmail,
            'has_phone'           => $hasPhone,
            'is_lead'             => (bool) $v->is_lead,
            'is_online'           => $isOnline,
            'country'             => $v->country,
            'city'                => $v->city,
            'visitor_ip'          => $v->visitor_ip,
            'current_page'        => $isOnline ? $v->current_page : null,
            'current_page_title'  => $isOnline ? $v->current_page_title : null,
            'visit_count'         => (int) $v->visit_count,
            'page_views_count'    => (int) $v->page_views_count,
            'messages_count'      => (int) $v->messages_count,
            'last_seen_at'        => $v->last_seen_at?->toIso8601String(),
            'first_seen_at'       => $v->first_seen_at?->toIso8601String(),
            'brand_id'            => $v->brand_id,
            'guest_id'            => $v->guest_id,
            'guest'               => $v->guest ? [
                'id'    => $v->guest->id,
                'name'  => $v->guest->full_name,
            ] : null,
            'conversation'        => $conversation ? [
                'id'                   => $conversation->id,
                'status'               => $conversation->status,
                'last_message_preview' => $lastMessage ? \Illuminate\Support\Str::limit((string) $lastMessage->content, 120) : null,
                'last_message_sender'  => $lastMessage?->sender_type,
                'last_message_at'      => $conversation->last_message_at?->toIso8601String(),
                'lead_captured'        => (bool) $conversation->lead_captured,
                'ai_enabled'           => (bool) $conversation->ai_enabled,
                'assigned_to'          => $conversation->assigned_to,
                'unread_admin_count'   => (int) $unreadCount,
            ] : null,
            'priority_score'      => $score,
        ];
    }

    /**
     * Priority scoring per ENGAGEMENT_HUB_PLAN.md:
     *
     *   1000  online + unread visitor message
     *    700  online + AI replying right now            (proxy: active chat with ai_enabled)
     *    500  online + has captured contact
     *    300  has captured contact + last seen ≤ 1h ago
     *    100  online + anonymous
     *   +200  conversation waiting > 5 min for human reply
     *    +50  any activity in last 24h
     *
     * Each branch returns the highest-applicable base score; boosts add on top.
     */
    private function scoreRow(
        bool $isOnline,
        bool $hasContact,
        bool $hasUnreadVisitor,
        bool $hasActiveChat,
        bool $isLead,
        ?\Carbon\Carbon $lastSeenAt,
        ?ChatConversation $conversation,
        ?\App\Models\ChatMessage $lastMessage,
    ): int {
        $base = 0;

        if ($isOnline && $hasUnreadVisitor) {
            $base = 1000;
        } elseif ($isOnline && $hasActiveChat && $conversation?->ai_enabled) {
            $base = 700;
        } elseif ($isOnline && $hasContact) {
            $base = 500;
        } elseif ($hasContact && $lastSeenAt && $lastSeenAt->gt(now()->subHour())) {
            $base = 300;
        } elseif ($isOnline) {
            $base = 100;
        }

        // Boost: human-waiting conversation past 5 min — these need attention now
        if ($conversation
            && $conversation->status === 'active'
            && empty($conversation->assigned_to)
            && $conversation->last_message_at
            && $conversation->last_message_at->lt(now()->subMinutes(5))
            && $lastMessage?->sender_type === 'visitor') {
            $base += 200;
        }

        // Boost: any activity within 24h gets a small lift over completely cold rows
        if ($lastSeenAt && $lastSeenAt->gt(now()->subHours(self::RECENT_ACTIVITY_HOURS))) {
            $base += 50;
        }

        return $base;
    }

    /**
     * Best human-readable name for the row. Cascades through all the signals
     * we have until something useful surfaces.
     */
    private function effectiveName(Visitor $v): string
    {
        if (!empty($v->display_name))      return $v->display_name;
        if (!empty($v->guest?->full_name)) return $v->guest->full_name;
        if (!empty($v->email))             return $v->email;
        if (!empty($v->phone))             return $v->phone;
        if (!empty($v->city) && !empty($v->country)) {
            return "Anonymous · {$v->city}, {$v->country}";
        }
        if (!empty($v->country)) {
            return "Anonymous · {$v->country}";
        }
        return $v->visitor_ip ?: 'Anonymous';
    }
}
