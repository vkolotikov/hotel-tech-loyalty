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
            ->with(['assignedAgent:id,name,email', 'member.user:id,name,email', 'member.tier:id,name'])
            ->withCount(['messages as unread_count' => fn($q) => $q->where('is_read', false)->where('sender_type', 'visitor')]);

        // Filter by status
        if ($request->status && $request->status !== 'all') {
            $query->where('status', $request->status);
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

        $conversations = $query->orderByDesc('last_message_at')->paginate(50);

        // Annotate each conversation with how many other conversations exist
        // for the same visitor IP — lets the UI show "(N sessions)" so admins
        // know they're talking to the same person across multiple tabs/devices.
        $ips = collect($conversations->items())->pluck('visitor_ip')->filter()->unique()->values();
        if ($ips->isNotEmpty()) {
            $counts = ChatConversation::where('organization_id', $orgId)
                ->whereIn('visitor_ip', $ips)
                ->select('visitor_ip', DB::raw('COUNT(*) as c'))
                ->groupBy('visitor_ip')
                ->pluck('c', 'visitor_ip');
            foreach ($conversations->items() as $c) {
                $c->ip_session_count = $c->visitor_ip ? (int) ($counts[$c->visitor_ip] ?? 1) : 1;
            }
        }

        return response()->json($conversations);
    }

    /**
     * Get a single conversation with messages.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->with(['assignedAgent:id,name,email', 'member.user:id,name,email', 'member.tier:id,name'])
            ->findOrFail($id);

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

        return response()->json([
            'conversation' => $conversation,
            'messages' => $messages,
            'siblings' => $siblings,
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

        $conversation->update(['status' => $request->status]);

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

        $conversation->update(['ai_enabled' => $request->boolean('ai_enabled')]);

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

        $conversation = ChatConversation::where('organization_id', $request->user()->organization_id)
            ->findOrFail($id);

        $message = ChatMessage::create([
            'conversation_id' => $id,
            'sender_type' => 'agent',
            'sender_user_id' => $request->user()->id,
            'content' => $request->content,
            'created_at' => now(),
        ]);

        $conversation->update([
            'last_message_at' => now(),
            'messages_count' => $conversation->messages_count + 1,
            'assigned_to' => $conversation->assigned_to ?? $request->user()->id,
        ]);

        return response()->json($message->load('senderUser:id,name'));
    }

    /**
     * Get inbox stats/alerts.
     */
    public function stats(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        return response()->json([
            'active' => ChatConversation::where('organization_id', $orgId)->where('status', 'active')->count(),
            'waiting' => ChatConversation::where('organization_id', $orgId)->where('status', 'waiting')->count(),
            'unassigned' => ChatConversation::where('organization_id', $orgId)->whereIn('status', ['active', 'waiting'])->whereNull('assigned_to')->count(),
            'resolved_today' => ChatConversation::where('organization_id', $orgId)->where('status', 'resolved')->where('updated_at', '>=', today())->count(),
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

        return response()->json([
            'success' => true,
            'inquiry_id' => $inquiry->id,
            'guest_id' => $guest->id,
        ]);
    }
}
