<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Member-initiated chat (Contact Hotel flow).
 *
 * The chat subsystem already supports visitor-initiated conversations
 * through the website widget. This controller lets an authenticated
 * mobile member open their own conversation, identifiable by tier —
 * messages land in the same staff Inbox alongside visitor chats.
 *
 * One active conversation per member at a time: `current()` returns the
 * member's open conversation (or creates one on first call via `start()`).
 * Messages use `sender_type='visitor'` to keep parity with the widget's
 * message shape so the staff Inbox doesn't need a new branch.
 */
class MemberChatController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
    ) {}

    /** GET /v1/member/chat — returns active conversation or null */
    public function current(Request $request): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember;

        if (!$member) {
            return response()->json(null);
        }

        $conv = ChatConversation::where('organization_id', $user->organization_id)
            ->where('member_id', $member->id)
            ->whereIn('status', ['active', 'waiting'])
            ->latest('last_message_at')
            ->first();

        return response()->json($conv);
    }

    /** POST /v1/member/chat/start — open a new conversation */
    public function start(Request $request): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember;

        if (!$member) {
            return response()->json(['message' => 'No loyalty profile attached.'], 422);
        }

        // Reuse an already-open conversation — avoids spamming the inbox
        // when the member taps "Contact Hotel" repeatedly.
        $existing = ChatConversation::where('organization_id', $user->organization_id)
            ->where('member_id', $member->id)
            ->whereIn('status', ['active', 'waiting'])
            ->latest('last_message_at')
            ->first();

        if ($existing) {
            return response()->json($existing);
        }

        $conv = ChatConversation::create([
            'organization_id' => $user->organization_id,
            'member_id'       => $member->id,
            'visitor_name'    => $user->name ?? 'Member',
            'visitor_email'   => $user->email,
            'visitor_phone'   => $user->phone ?? null,
            'status'          => 'waiting',
            'lead_captured'   => true,
            'source'          => 'mobile_app',
            'started_at'      => now(),
            'last_message_at' => now(),
        ]);

        return response()->json($conv, 201);
    }

    /** GET /v1/member/chat/{id}/messages?since=messageId */
    public function messages(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember;

        $conv = ChatConversation::where('organization_id', $user->organization_id)
            ->where('member_id', $member?->id)
            ->findOrFail($id);

        $query = ChatMessage::where('conversation_id', $conv->id);
        if ($since = $request->get('since')) {
            $query->where('id', '>', (int) $since);
        }

        $messages = $query->orderBy('created_at')->get();

        // Mark incoming agent messages as read — member is looking at them.
        ChatMessage::where('conversation_id', $conv->id)
            ->where('sender_type', 'agent')
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return response()->json($messages);
    }

    /** POST /v1/member/chat/{id}/messages */
    public function send(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'content' => 'required|string|max:5000',
        ]);

        $user = $request->user();
        $member = $user->loyaltyMember;

        $conv = ChatConversation::where('organization_id', $user->organization_id)
            ->where('member_id', $member?->id)
            ->findOrFail($id);

        // Reopen if the member is writing to a closed conversation
        if (!in_array($conv->status, ['active', 'waiting'])) {
            $conv->status = 'waiting';
        }

        $msg = ChatMessage::create([
            'conversation_id' => $conv->id,
            'sender_type'     => 'visitor',
            'content'         => $validated['content'],
            'is_read'         => false,
            'created_at'      => now(),
        ]);

        $conv->update([
            'last_message_at' => now(),
            'messages_count'  => ($conv->messages_count ?? 0) + 1,
            'status'          => $conv->status,
        ]);

        // Notify staff in near-real-time via SSE
        $this->realtime->dispatch(
            'chat',
            'Member Message',
            "{$conv->visitor_name}: " . mb_substr($validated['content'], 0, 100),
            [
                'conversation_id' => $conv->id,
                'member_id'       => $member->id,
                'member_tier'     => $member->tier?->name,
                'preview'         => mb_substr($validated['content'], 0, 100),
            ]
        );

        return response()->json($msg, 201);
    }
}
