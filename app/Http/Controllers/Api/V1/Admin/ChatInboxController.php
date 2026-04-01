<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Guest;
use App\Models\Inquiry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        // Mark visitor messages as read
        ChatMessage::where('conversation_id', $id)
            ->where('sender_type', 'visitor')
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json([
            'conversation' => $conversation,
            'messages' => $messages,
        ]);
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
                'organization_id' => $orgId,
                'first_name' => $nameParts[0] ?? '',
                'last_name' => $nameParts[1] ?? '',
                'full_name' => $validated['name'] ?? $conversation->visitor_name ?? 'Visitor',
                'email' => $validated['email'] ?? $conversation->visitor_email,
                'phone' => $validated['phone'] ?? $conversation->visitor_phone,
                'guest_type' => 'individual',
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

        return response()->json([
            'success' => true,
            'inquiry_id' => $inquiry->id,
            'guest_id' => $guest->id,
        ]);
    }
}
