<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatMessageFeedback;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\KnowledgeCategory;
use App\Models\KnowledgeItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ChatInboxController extends Controller
{
    /**
     * List conversations with filters.
     */
    public function index(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        $query = ChatConversation::where('organization_id', $orgId)
            ->with([
                'assignedAgent:id,name,email',
                'member.user:id,name,email',
                'member.tier:id,name',
                'messages' => fn($q) => $q->latest()->limit(1),
            ])
            ->withCount(['messages as unread_count' => fn($q) => $q->where('is_read', false)->where('sender_type', 'visitor')]);

        // Default: hide empty conversations (visitor opened the widget but never
        // typed anything — these are noise for the agent inbox; they live on
        // the Visitors page already). Show them when the agent explicitly
        // opts in via ?include_empty=1, when searching, or when a filter is
        // applied that implies intent.
        if (!$request->boolean('include_empty') && !$request->filled('search')) {
            $query->where(function ($q) {
                $q->whereExists(function ($sub) {
                    $sub->select(DB::raw(1))
                        ->from('chat_messages')
                        ->whereColumn('chat_messages.conversation_id', 'chat_conversations.id')
                        ->where('chat_messages.sender_type', 'visitor');
                })
                ->orWhereNotNull('visitor_email')
                ->orWhereNotNull('visitor_phone')
                ->orWhere('lead_captured', true);
            });
        }

        // Filter by status. Accept 'closed' as an alias for resolved+archived
        // so the mobile/web filter chip lines up with the per-status counts
        // returned by /stats.
        if ($request->status && $request->status !== 'all') {
            if ($request->status === 'closed') {
                $query->whereIn('status', ['resolved', 'archived']);
            } else {
                $query->where('status', $request->status);
            }
        }

        // Filter by assigned agent
        if ($request->assigned_to) {
            $query->where('assigned_to', $request->assigned_to);
        }

        // Filter unassigned
        if ($request->boolean('unassigned')) {
            $query->whereNull('assigned_to');
        }

        // Search by visitor name/email
        if ($request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('visitor_name', 'ILIKE', "%{$search}%")
                  ->orWhere('visitor_email', 'ILIKE', "%{$search}%");
            });
        }

        // Group by visitor: collapse multiple sessions from the same person
        // into a single row (the most recent one). Uses PostgreSQL DISTINCT ON
        // to pick the latest conversation per dedup key in a single query.
        // Dedup key cascade: visitor_id → email → phone → ip → conversation id.
        if ($request->boolean('group_by_visitor')) {
            $dedupKey = <<<'SQL'
                COALESCE(
                    NULLIF(visitor_id::text, ''),
                    NULLIF(LOWER(TRIM(visitor_email)), ''),
                    NULLIF(REGEXP_REPLACE(visitor_phone, '\D', '', 'g'), ''),
                    NULLIF(visitor_ip, ''),
                    id::text
                )
            SQL;

            $keepIds = DB::table('chat_conversations')
                ->where('organization_id', $orgId)
                ->selectRaw("DISTINCT ON ({$dedupKey}) id")
                ->orderByRaw("{$dedupKey}, last_message_at DESC")
                ->pluck('id');

            $query->whereIn('id', $keepIds);
        }

        $conversations = $query->orderByDesc('last_message_at')->paginate(50);

        // Annotate each conversation with the total number of conversations
        // belonging to the same visitor, so the UI can show "(N sessions)".
        // We resolve "same visitor" by visitor_id when present, otherwise
        // visitor_ip — matching the dedup logic above.
        $items = collect($conversations->items());
        $visitorIds = $items->pluck('visitor_id')->filter()->unique()->values();
        $visitorIdCounts = $visitorIds->isNotEmpty()
            ? ChatConversation::where('organization_id', $orgId)
                ->whereIn('visitor_id', $visitorIds)
                ->select('visitor_id', DB::raw('COUNT(*) as c'))
                ->groupBy('visitor_id')
                ->pluck('c', 'visitor_id')
            : collect();

        $ips = $items->whereNull('visitor_id')->pluck('visitor_ip')->filter()->unique()->values();
        $ipCounts = $ips->isNotEmpty()
            ? ChatConversation::where('organization_id', $orgId)
                ->whereNull('visitor_id')
                ->whereIn('visitor_ip', $ips)
                ->select('visitor_ip', DB::raw('COUNT(*) as c'))
                ->groupBy('visitor_ip')
                ->pluck('c', 'visitor_ip')
            : collect();

        foreach ($conversations->items() as $c) {
            if ($c->visitor_id) {
                $c->ip_session_count = (int) ($visitorIdCounts[$c->visitor_id] ?? 1);
            } elseif ($c->visitor_ip) {
                $c->ip_session_count = (int) ($ipCounts[$c->visitor_ip] ?? 1);
            } else {
                $c->ip_session_count = 1;
            }
            $latest = $c->messages->first();
            $c->last_message = $latest?->content;
            unset($c->messages);
        }

        return response()->json($conversations);
    }

    /**
     * Get a single conversation with messages.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->with([
                'assignedAgent:id,name,email',
                'member.user:id,name,email',
                'member.tier:id,name',
                'visitor:id,country,city,visit_count,page_views_count,first_seen_at,last_seen_at,referrer,is_lead',
            ])
            ->findOrFail($id);

        // Attach the last handful of pages the visitor viewed so the mobile/admin
        // chat screens can show the journey without a second request.
        if ($conversation->visitor_id) {
            $conversation->setRelation(
                'visitor_page_views',
                \App\Models\VisitorPageView::where('visitor_id', $conversation->visitor_id)
                    ->orderByDesc('id')
                    ->limit(10)
                    ->get(['id', 'url', 'title', 'viewed_at'])
            );
        }

        $messages = ChatMessage::where('conversation_id', $id)
            ->with('senderUser:id,name')
            ->orderBy('created_at')
            ->get();

        // Attach feedback for each AI message so the UI can show the existing rating.
        $aiMessageIds = $messages->where('sender_type', 'ai')->pluck('id')->all();
        $feedback = $aiMessageIds
            ? ChatMessageFeedback::whereIn('message_id', $aiMessageIds)->get()->keyBy('message_id')
            : collect();
        $messages->each(function ($m) use ($feedback) {
            $m->feedback = $feedback->get($m->id);
        });

        // Mark visitor messages as read
        ChatMessage::where('conversation_id', $id)
            ->where('sender_type', 'visitor')
            ->where('is_read', false)
            ->update(['is_read' => true]);

        // Find sibling conversations from the same IP so admins can jump between them.
        $siblings = [];
        if ($conversation->visitor_ip) {
            $siblings = ChatConversation::where('organization_id', $conversation->organization_id)
                ->where('visitor_ip', $conversation->visitor_ip)
                ->where('id', '!=', $id)
                ->orderByDesc('last_message_at')
                ->limit(20)
                ->get(['id', 'visitor_name', 'status', 'last_message_at', 'channel']);
        }

        $visitorTyping = $conversation->visitor_typing_until && $conversation->visitor_typing_until->isFuture();

        return response()->json([
            'conversation'   => $conversation,
            'messages'       => $messages,
            'siblings'       => $siblings,
            'visitor_typing' => (bool) $visitorTyping,
        ]);
    }

    /**
     * Update visitor contact details inline (without creating an inquiry).
     */
    public function updateContact(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'visitor_name'    => 'nullable|string|max:120',
            'visitor_email'   => 'nullable|email|max:180',
            'visitor_phone'   => 'nullable|string|max:30',
            'visitor_country' => 'nullable|string|max:100',
            'visitor_city'    => 'nullable|string|max:100',
            'agent_notes'     => 'nullable|string|max:5000',
        ]);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $conversation->update($validated);

        return response()->json($conversation->fresh());
    }

    /**
     * Submit thumbs up/down feedback on an AI message and optionally save the
     * correction to the knowledge base so the AI learns from it.
     */
    public function submitFeedback(Request $request, int $messageId): JsonResponse
    {
        $validated = $request->validate([
            'rating'              => 'required|in:good,bad',
            'comment'             => 'nullable|string|max:5000',
            'apply_to_training'   => 'nullable|boolean',
            'corrected_answer'    => 'nullable|string|max:10000',
        ]);

        $orgId = $request->user()->organization_id;

        // Look up the message and ensure it belongs to a conversation in this org.
        $message = ChatMessage::findOrFail($messageId);
        $conv = ChatConversation::where('organization_id', $orgId)
            ->where('id', $message->conversation_id)
            ->firstOrFail();

        $feedback = ChatMessageFeedback::updateOrCreate(
            ['message_id' => $messageId, 'user_id' => $request->user()->id],
            [
                'organization_id'    => $orgId,
                'rating'             => $validated['rating'],
                'comment'            => $validated['comment'] ?? null,
                'applied_to_training' => false,
            ]
        );

        // If they want to teach the AI: find the visitor question that triggered
        // this AI reply and store it as a knowledge item so future similar
        // questions get the corrected answer.
        if (!empty($validated['apply_to_training']) && !empty($validated['corrected_answer'])) {
            try {
                // Get the visitor message immediately preceding this AI message.
                $question = ChatMessage::where('conversation_id', $conv->id)
                    ->where('sender_type', 'visitor')
                    ->where('created_at', '<', $message->created_at)
                    ->orderByDesc('created_at')
                    ->value('content');

                if ($question) {
                    $category = KnowledgeCategory::firstOrCreate(
                        ['organization_id' => $orgId, 'name' => 'AI Corrections'],
                        ['description' => 'Auto-curated answers from agent feedback', 'priority' => 10, 'sort_order' => 0, 'is_active' => true]
                    );

                    KnowledgeItem::create([
                        'organization_id' => $orgId,
                        'category_id'     => $category->id,
                        'question'        => $question,
                        'answer'          => $validated['corrected_answer'],
                        'keywords'        => [],
                        'priority'        => 10,
                        'use_count'       => 0,
                        'is_active'       => true,
                    ]);

                    $feedback->update(['applied_to_training' => true]);
                }
            } catch (\Throwable $e) {
                \Log::warning('Chat feedback training save failed', ['error' => $e->getMessage()]);
            }
        }

        return response()->json($feedback->fresh());
    }

    /**
     * Assign conversation to an agent.
     */
    public function assign(Request $request, int $id): JsonResponse
    {
        $request->validate(['user_id' => 'required|exists:users,id']);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $conversation->update([
            'assigned_to' => $request->user_id,
            'status' => $conversation->status === 'waiting' ? 'active' : $conversation->status,
        ]);

        // Add system message
        ChatMessage::create([
            'conversation_id' => $id,
            'sender_type' => 'system',
            'sender_user_id' => $request->user()->id,
            'content' => "Conversation assigned to " . \App\Models\User::find($request->user_id)?->name,
            'created_at' => now(),
        ]);

        return response()->json($conversation->fresh('assignedAgent:id,name,email'));
    }

    /**
     * Update conversation status.
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $request->validate(['status' => 'required|in:active,waiting,resolved,archived']);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $updates = ['status' => $request->status];
        // When the agent marks a conversation resolved, flag that we want a
        // rating from the visitor — the next poll surfaces a rating prompt
        // in the widget. Idempotent: only flips false→true.
        if ($request->status === 'resolved' && !$conversation->rating_requested) {
            $updates['rating_requested'] = true;
        }
        $conversation->update($updates);

        ChatMessage::create([
            'conversation_id' => $id,
            'sender_type' => 'system',
            'sender_user_id' => $request->user()->id,
            'content' => "Status changed to {$request->status}",
            'created_at' => now(),
        ]);

        return response()->json($conversation);
    }

    /**
     * Toggle whether the AI auto-replies on this conversation. When an
     * agent disables it, the widget keeps accepting visitor messages but
     * skips the AI call so the human can take over.
     */
    public function toggleAi(Request $request, int $id): JsonResponse
    {
        $request->validate(['ai_enabled' => 'required|boolean']);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $aiEnabled = $request->boolean('ai_enabled');
        $updates = ['ai_enabled' => $aiEnabled];
        // When AI takes back over, clear the active human agent identity so
        // the visitor's widget stops showing "Sarah is helping you" and goes
        // back to the bot avatar.
        if ($aiEnabled) {
            $updates['active_agent_name'] = null;
            $updates['active_agent_avatar'] = null;
        }
        $conversation->update($updates);

        ChatMessage::create([
            'conversation_id' => $id,
            'sender_type'     => 'system',
            'sender_user_id'  => $request->user()->id,
            'content'         => $request->boolean('ai_enabled')
                ? 'AI auto-reply re-enabled by agent'
                : 'AI auto-reply paused by agent',
            'created_at'      => now(),
        ]);

        return response()->json($conversation);
    }

    /**
     * Send a message as agent.
     */
    public function sendMessage(Request $request, int $id): JsonResponse
    {
        $request->validate(['content' => 'required|string|max:5000']);

        $user = $request->user();
        $conversation = ChatConversation::where('organization_id', $user->organization_id)
            ->findOrFail($id);

        $message = ChatMessage::create([
            'conversation_id' => $id,
            'sender_type' => 'agent',
            'sender_user_id' => $user->id,
            'content' => $request->content,
            'created_at' => now(),
        ]);

        // Snapshot the agent's display name + avatar onto the conversation so
        // the visitor's widget can render "Sarah is helping you" on the next
        // poll. We do it here (rather than reading users on every poll) so
        // the widget gets a stable identity even if assignment changes later.
        $avatar = $user->chat_avatar_url ?? null;
        $conversation->update([
            'last_message_at'      => now(),
            'messages_count'       => $conversation->messages_count + 1,
            'assigned_to'          => $conversation->assigned_to ?? $user->id,
            'active_agent_name'    => $user->name,
            'active_agent_avatar'  => $avatar,
            'agent_typing_until'   => null, // clear typing as the message lands
        ]);

        return response()->json($message->load('senderUser:id,name'));
    }

    /**
     * POST /v1/admin/chat-inbox/{id}/upload — agent uploads an attachment.
     * Stores the file under storage/app/public/chat-attachments/ and creates
     * a chat_message row tagged as the agent sender. The visitor's widget
     * picks it up on the next poll cycle and renders a thumbnail / link.
     */
    public function uploadAttachment(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|max:8192|mimes:jpg,jpeg,png,gif,webp,pdf,doc,docx,txt',
        ]);

        $user = $request->user();
        $conversation = ChatConversation::where('organization_id', $user->organization_id)
            ->findOrFail($id);

        $file = $request->file('file');
        $path = $file->storePublicly('chat-attachments', 'public');
        $url  = '/storage/' . $path;
        $type = str_starts_with((string) $file->getMimeType(), 'image/') ? 'image' : 'file';

        $msg = ChatMessage::create([
            'conversation_id' => $id,
            'sender_type'     => 'agent',
            'sender_user_id'  => $user->id,
            'content'         => $file->getClientOriginalName(),
            'attachment_url'  => $url,
            'attachment_type' => $type,
            'attachment_size' => $file->getSize(),
            'created_at'      => now(),
        ]);

        $conversation->update([
            'last_message_at'     => now(),
            'messages_count'      => $conversation->messages_count + 1,
            'assigned_to'         => $conversation->assigned_to ?? $user->id,
            'active_agent_name'   => $user->name,
            'active_agent_avatar' => $user->chat_avatar_url ?? null,
            'agent_typing_until'  => null,
        ]);

        return response()->json($msg->load('senderUser:id,name'));
    }

    /**
     * GET /v1/admin/chat-inbox/{id}/transcript — download a plain-text or
     * HTML transcript of the conversation. Useful for emailing a copy to a
     * lead or attaching to a CRM ticket. Format defaults to text; pass
     * ?format=html for an HTML version.
     */
    public function transcript(Request $request, int $id)
    {
        $user = $request->user();
        $conversation = ChatConversation::where('organization_id', $user->organization_id)
            ->findOrFail($id);

        $messages = ChatMessage::where('conversation_id', $id)
            ->orderBy('id')
            ->get();

        $format = $request->input('format', 'text');
        $visitor = $conversation->visitor_name ?: 'Visitor';
        $filenameBase = 'chat-' . $conversation->id . '-' . now()->format('Ymd-His');

        if ($format === 'html') {
            $rows = '';
            foreach ($messages as $m) {
                $who = match ($m->sender_type) {
                    'visitor' => htmlspecialchars($visitor),
                    'agent'   => htmlspecialchars($conversation->active_agent_name ?: 'Agent'),
                    'ai'      => 'AI Assistant',
                    'system'  => 'System',
                    default   => ucfirst($m->sender_type),
                };
                $when = optional($m->created_at)->format('Y-m-d H:i');
                $body = nl2br(htmlspecialchars((string) $m->content));
                if ($m->attachment_url) {
                    $body .= '<br><a href="' . htmlspecialchars($m->attachment_url) . '">[attachment: ' . htmlspecialchars($m->attachment_type ?: 'file') . ']</a>';
                }
                $rows .= "<tr><td style=\"padding:6px;color:#888;font-size:12px;white-space:nowrap;vertical-align:top\">{$when}</td><td style=\"padding:6px;font-weight:600;white-space:nowrap;vertical-align:top\">{$who}</td><td style=\"padding:6px\">{$body}</td></tr>";
            }
            $html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Chat Transcript #{$conversation->id}</title></head><body style=\"font-family:Arial,sans-serif;background:#fff;color:#222\"><h2>Chat Transcript #{$conversation->id}</h2><p>Visitor: " . htmlspecialchars($visitor) . "<br>Started: " . optional($conversation->created_at)->format('Y-m-d H:i') . "</p><table style=\"border-collapse:collapse;width:100%\">{$rows}</table></body></html>";
            return response($html, 200, [
                'Content-Type'        => 'text/html; charset=UTF-8',
                'Content-Disposition' => 'attachment; filename="' . $filenameBase . '.html"',
            ]);
        }

        $lines = [];
        $lines[] = "Chat Transcript #{$conversation->id}";
        $lines[] = "Visitor: {$visitor}";
        $lines[] = "Started: " . optional($conversation->created_at)->format('Y-m-d H:i');
        $lines[] = str_repeat('-', 60);
        foreach ($messages as $m) {
            $who = match ($m->sender_type) {
                'visitor' => $visitor,
                'agent'   => $conversation->active_agent_name ?: 'Agent',
                'ai'      => 'AI',
                'system'  => 'System',
                default   => ucfirst($m->sender_type),
            };
            $when = optional($m->created_at)->format('Y-m-d H:i');
            $line = "[{$when}] {$who}: " . trim((string) $m->content);
            if ($m->attachment_url) {
                $line .= " <attachment: {$m->attachment_url}>";
            }
            $lines[] = $line;
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type'        => 'text/plain; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filenameBase . '.txt"',
        ]);
    }

    /**
     * GET/PUT canned responses for the org. Stored on chat_widget_configs as
     * a JSON array of {label, text} so agents can insert pre-written replies
     * with one click. Org-scoped, not per-user.
     */
    public function getCannedResponses(Request $request): JsonResponse
    {
        $config = \App\Models\ChatWidgetConfig::where('organization_id', $request->user()->organization_id)->first();
        return response()->json(['canned_responses' => $config?->canned_responses ?? []]);
    }

    public function updateCannedResponses(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'canned_responses'           => 'required|array|max:50',
            'canned_responses.*.label'   => 'required|string|max:80',
            'canned_responses.*.text'    => 'required|string|max:2000',
        ]);

        $orgId = $request->user()->organization_id;
        $config = \App\Models\ChatWidgetConfig::where('organization_id', $orgId)->first();
        if (!$config) {
            $config = \App\Models\ChatWidgetConfig::create([
                'organization_id' => $orgId,
                'widget_key'      => \Illuminate\Support\Str::uuid()->toString(),
                'api_key'         => \Illuminate\Support\Str::random(48),
                'is_active'       => true,
            ]);
        }
        $config->update(['canned_responses' => $validated['canned_responses']]);

        return response()->json(['canned_responses' => $config->canned_responses]);
    }

    /**
     * GET assignable agents — returns users in the org who can take chat
     * conversations. Used by the transfer dropdown in the inbox.
     */
    public function listAgents(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;
        $agents = \App\Models\User::where('organization_id', $orgId)
            ->where('user_type', 'staff')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'chat_avatar_url']);
        return response()->json($agents);
    }

    /**
     * Mark the agent as typing on this conversation. Sets a 5-second window so
     * the visitor's widget poll can render typing dots while the agent is
     * composing in the inbox. Frontend should call this on input changes
     * (debounced) and also when sending so the indicator clears naturally as
     * the message arrives.
     */
    public function setAgentTyping(Request $request, int $id): JsonResponse
    {
        $request->validate(['typing' => 'nullable|boolean']);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $isTyping = $request->boolean('typing', true);
        $conversation->agent_typing_until = $isTyping ? now()->addSeconds(5) : null;
        $conversation->save();

        return response()->json(['ok' => true]);
    }

    /**
     * Quick poll for the inbox: returns any new messages on a conversation
     * since `since_id`, plus current visitor typing state. Lets the inbox
     * UI surface visitor replies in near-real-time without a websocket.
     */
    public function pollMessages(Request $request, int $id): JsonResponse
    {
        $request->validate(['since_id' => 'nullable|integer|min:0']);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $sinceId = (int) $request->input('since_id', 0);

        $messages = ChatMessage::where('conversation_id', $id)
            ->where('id', '>', $sinceId)
            ->with('senderUser:id,name')
            ->orderBy('id')
            ->get();

        // Mark visitor messages as read since the agent is actively viewing.
        if ($messages->count() > 0) {
            ChatMessage::where('conversation_id', $id)
                ->where('id', '>', $sinceId)
                ->where('sender_type', 'visitor')
                ->update(['is_read' => true]);
        }

        $visitorTyping = $conversation->visitor_typing_until && $conversation->visitor_typing_until->isFuture();

        return response()->json([
            'messages'       => $messages,
            'visitor_typing' => (bool) $visitorTyping,
            'status'         => $conversation->status,
        ]);
    }

    /**
     * Get inbox stats/alerts.
     *
     * Returns both the "raw" per-status totals (active / waiting / resolved /
     * archived / total) and a scoped `active_24h` metric.
     *
     * Context: the raw `active` count inflates because the widget creates a
     * chat_conversations row on page load (not first message), and stale rows
     * never auto-close. Clients that want "active that's actually active"
     * should prefer `active_24h`. The mobile Inbox tab-bar badge uses
     * `unassigned` which is still the safer day-to-day trigger.
     */
    public function stats(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        // Single grouped query for per-status counts — was 4+ separate counts
        $statusCounts = ChatConversation::where('organization_id', $orgId)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        // Active conversations that have actually had a message in the last 24h —
        // excludes abandoned widget-open rows and AI-only chatter.
        $active24h = ChatConversation::where('organization_id', $orgId)
            ->whereIn('status', ['active', 'waiting'])
            ->where(function ($q) {
                $q->where('last_message_at', '>=', now()->subHours(24))
                  ->orWhere('updated_at', '>=', now()->subHours(24));
            })
            ->count();

        // Unread visitor messages across open conversations — drives the
        // mobile tab bar badge and web admin favicon dot.
        $unreadMessages = ChatMessage::join('chat_conversations', 'chat_messages.conversation_id', '=', 'chat_conversations.id')
            ->where('chat_conversations.organization_id', $orgId)
            ->whereIn('chat_conversations.status', ['active', 'waiting'])
            ->where('chat_messages.sender_type', 'visitor')
            ->where('chat_messages.is_read', false)
            ->count();

        $unassigned = ChatConversation::where('organization_id', $orgId)
            ->whereIn('status', ['active', 'waiting'])
            ->whereNull('assigned_to')
            ->count();

        $resolvedToday = ChatConversation::where('organization_id', $orgId)
            ->where('status', 'resolved')
            ->where('updated_at', '>=', today())
            ->count();

        $active   = (int) ($statusCounts['active']   ?? 0);
        $waiting  = (int) ($statusCounts['waiting']  ?? 0);
        $resolved = (int) ($statusCounts['resolved'] ?? 0);
        $archived = (int) ($statusCounts['archived'] ?? 0);
        $closed   = $resolved + $archived;
        $total    = $active + $waiting + $closed;

        return response()->json([
            'active'          => $active,
            'waiting'         => $waiting,
            'resolved'        => $resolved,
            'archived'        => $archived,
            'closed'          => $closed,     // resolved + archived
            'total'           => $total,
            'active_24h'      => $active24h,
            'unassigned'      => $unassigned,
            'resolved_today'  => $resolvedToday,
            'unread_messages' => $unreadMessages,
        ]);
    }

    /**
     * Capture a lead from a conversation — creates Guest + Inquiry.
     */
    public function captureLead(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'name'  => 'nullable|string|max:120',
            'email' => 'nullable|email|max:180',
            'phone' => 'nullable|string|max:30',
            'notes' => 'nullable|string|max:2000',
        ]);

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $orgId = $conversation->organization_id;

        // Find or create guest
        $guest = null;
        if (!empty($validated['email'])) {
            $guest = Guest::where('organization_id', $orgId)->where('email', $validated['email'])->first();
        }

        if (!$guest) {
            $nameParts = explode(' ', $validated['name'] ?? $conversation->visitor_name ?? 'Visitor', 2);
            $guest = Guest::create([
                'organization_id'  => $orgId,
                'first_name'       => $nameParts[0] ?? '',
                'last_name'        => $nameParts[1] ?? '',
                'full_name'        => $validated['name'] ?? $conversation->visitor_name ?? 'Visitor',
                'email'            => $validated['email'] ?? $conversation->visitor_email,
                'phone'            => $validated['phone'] ?? $conversation->visitor_phone,
                'guest_type'       => 'Individual',
                'lead_source'      => 'Chat Widget',
                'lifecycle_status' => 'Lead',
                'last_activity_at' => now(),
            ]);
        }

        $inquiry = Inquiry::create([
            'organization_id' => $orgId,
            'guest_id' => $guest->id,
            'notes' => $validated['notes'] ?? 'Lead captured from chat conversation #' . $id,
            'source' => 'chatbot',
            'status' => 'new',
            'inquiry_type' => 'general',
        ]);

        $conversation->update([
            'lead_captured' => true,
            'inquiry_id' => $inquiry->id,
            'visitor_name' => $validated['name'] ?? $conversation->visitor_name,
            'visitor_email' => $validated['email'] ?? $conversation->visitor_email,
            'visitor_phone' => $validated['phone'] ?? $conversation->visitor_phone,
        ]);

        // Promote the visitor identity to lead and link the guest record.
        if ($conversation->visitor_id) {
            \App\Models\Visitor::where('id', $conversation->visitor_id)
                ->update([
                    'is_lead'      => true,
                    'guest_id'     => $guest->id,
                    'display_name' => $guest->full_name,
                    'email'        => $guest->email,
                    'phone'        => $guest->phone,
                ]);
        }

        // Engagement Hub Phase 4 v2 — fan out a realtime hot_lead event so
        // every admin's global poll picks it up regardless of which page
        // they're on. Wrapped so a realtime failure never blocks the
        // capture itself. The 10-min auto-purge in RealtimeEventService
        // keeps the table small.
        try {
            $contactBits = array_filter([$guest->email, $guest->phone]);
            app(\App\Services\RealtimeEventService::class)->dispatch(
                'hot_lead',
                'Hot lead: ' . ($guest->full_name ?: $conversation->visitor_name ?: 'Visitor'),
                $contactBits ? 'New contact: ' . implode(' · ', $contactBits) : 'Lead captured from chat',
                [
                    'visitor_id'      => $conversation->visitor_id,
                    'conversation_id' => $conversation->id,
                    'guest_id'        => $guest->id,
                    'action_url'      => '/engagement',
                ],
            );
        } catch (\Throwable $e) {
            \Log::warning('hot_lead realtime dispatch failed (admin capture): ' . $e->getMessage(), [
                'conversation_id' => $conversation->id,
            ]);
        }

        return response()->json([
            'success' => true,
            'inquiry_id' => $inquiry->id,
            'guest_id' => $guest->id,
        ]);
    }

    /**
     * POST /v1/admin/chat-inbox/transcribe — convert an agent's spoken reply
     * to text via OpenAI Whisper so staff can dictate long replies instead of
     * typing. Matches the widget-side /transcribe endpoint. Auto-detects
     * language (pass through to OpenAI), returns the transcript for the agent
     * to review before they hit Send.
     */
    public function transcribe(Request $request): JsonResponse
    {
        $request->validate([
            'audio'    => 'required|file|max:25600|mimes:webm,ogg,oga,mp3,mp4,m4a,wav,mpga,flac',
            'language' => 'nullable|string|max:8',
        ]);

        $apiKey = config('openai.api_key') ?: env('OPENAI_API_KEY');
        if (!$apiKey) {
            return response()->json(['error' => 'Transcription is not configured'], 503);
        }

        $file = $request->file('audio');
        $raw = $request->input('language');
        $language = null;
        if ($raw) {
            $raw = strtolower(trim($raw));
            if ($raw !== 'auto' && $raw !== '') {
                $language = substr(explode('-', $raw)[0], 0, 2);
            }
        }

        $payload = ['model' => 'gpt-4o-transcribe', 'response_format' => 'json'];
        if ($language) $payload['language'] = $language;

        try {
            $response = \Illuminate\Support\Facades\Http::withToken($apiKey)
                ->timeout(45)
                ->attach('file', file_get_contents($file->getRealPath()), $file->getClientOriginalName() ?: 'audio.webm')
                ->post('https://api.openai.com/v1/audio/transcriptions', $payload);

            if (!$response->successful()) {
                $payload['model'] = 'whisper-1';
                $response = \Illuminate\Support\Facades\Http::withToken($apiKey)
                    ->timeout(45)
                    ->attach('file', file_get_contents($file->getRealPath()), $file->getClientOriginalName() ?: 'audio.webm')
                    ->post('https://api.openai.com/v1/audio/transcriptions', $payload);
            }

            if (!$response->successful()) {
                \Log::warning('Admin transcribe failed', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                return response()->json(['error' => 'Transcription failed'], 502);
            }

            return response()->json([
                'text'     => trim((string) $response->json('text', '')),
                'language' => $response->json('language'),
            ]);
        } catch (\Throwable $e) {
            \Log::error('Admin transcribe crashed: ' . $e->getMessage());
            return response()->json(['error' => 'Transcription failed'], 500);
        }
    }
}
