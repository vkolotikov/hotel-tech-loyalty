<?php

namespace App\Services\Crm;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\Task;
use App\Models\User;
use App\Scopes\TenantScope;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * HexaTech CRM's Today (2026-11-07): what needs a person now, in one read. Reads only; every figure uses the full
 * admin's own definition of the same thing, so the two interfaces agree:
 *
 * - a chat **waits** while its status is `waiting`: the visitor wrote while the assistant was paused for the
 *   conversation, so nobody answers until a person does (WidgetChatController); **open** chats are `active` or
 *   `waiting` with a message in the last 24 hours (ChatInboxController::stats `active_24h`); every chat figure counts
 *   only the conversations the inbox lists (ChatConversation::shownInInbox, 2026-11-08: not a widget opened and never
 *   written in), as the inbox's stats do;
 * - a lead is **open** while its status is neither `Confirmed` nor `Lost` (InquiryController::kpis); its follow-up is
 *   **due** on its `next_task_due` day while `next_task_completed` is false, **overdue** before it — days are the
 *   venue's (VenueClock::today);
 * - **new leads** came in during the last 24 hours (InquiryController::today);
 * - a task is **yours** when it is assigned to you, **due** before the end of the venue's day and not completed.
 *
 * The lists are short (the newest or most urgent first); each area's own page holds the rest.
 */
final class CrmToday
{
    public const LIST_LIMIT = 8;

    /** @return array<string, mixed> */
    public function for(int $orgId, User $user): array
    {
        $today = VenueClock::today($orgId);
        $zone = VenueClock::zone($orgId);
        $dayEnds = CarbonImmutable::now($zone)->endOfDay()->utc();
        $dayStarts = CarbonImmutable::now($zone)->startOfDay()->utc();

        return [
            'today'    => $today,
            'chats'    => $this->chats(),
            'leads'    => $this->leads($today),
            'tasks'    => $this->tasks($user, $dayStarts, $dayEnds),
            'pipeline' => $this->pipeline(),
            'week'     => $this->week(),
        ];
    }

    /** @return array<string, mixed> */
    private function chats(): array
    {
        $waiting = ChatConversation::query()->shownInInbox()->where('status', 'waiting');
        $open = ChatConversation::query()->shownInInbox()
            ->whereIn('status', ['active', 'waiting'])
            ->where(fn ($q) => $q->where('last_message_at', '>=', now()->subHours(24))->orWhere('updated_at', '>=', now()->subHours(24)));
        $unassigned = ChatConversation::query()->shownInInbox()->whereIn('status', ['active', 'waiting'])->whereNull('assigned_to');

        $rows = (clone $waiting)
            ->with('assignedAgent:id,name')
            ->orderByDesc('last_message_at')
            ->limit(self::LIST_LIMIT)
            ->get(['id', 'visitor_name', 'visitor_email', 'visitor_phone', 'channel', 'assigned_to', 'last_message_at', 'page_url', 'intent_tag']);

        // The conversations are this organisation's (TenantScope above); their messages are read by conversation, as the
        // inbox does, whatever organisation id an older widget message row carries.
        $last = ChatMessage::withoutGlobalScope(TenantScope::class)
            ->whereIn('conversation_id', $rows->pluck('id'))
            ->where('sender_type', 'visitor')
            ->orderByDesc('created_at')
            ->get(['conversation_id', 'content'])
            ->unique('conversation_id')
            ->keyBy('conversation_id');

        return [
            'waiting'    => (clone $waiting)->count(),
            'open'       => $open->count(),
            'unassigned' => $unassigned->count(),
            'list'       => $rows->map(fn (ChatConversation $c) => [
                'id'          => (int) $c->id,
                'name'        => $c->visitor_name ?: null,
                'email'       => $c->visitor_email ?: null,
                'channel'     => $c->channel ?: 'widget',
                'intent'      => $c->intent_tag,
                'assigned_to' => $c->assignedAgent ? ['id' => (int) $c->assignedAgent->id, 'name' => (string) $c->assignedAgent->name] : null,
                'last_at'     => $c->last_message_at?->toIso8601String(),
                'excerpt'     => isset($last[$c->id]) ? mb_substr((string) $last[$c->id]->content, 0, 160) : null,
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function leads(string $today): array
    {
        $open = fn () => Inquiry::query()->whereNotIn('status', ['Confirmed', 'Lost']);
        $followUp = fn () => $open()->where('next_task_completed', false)->whereNotNull('next_task_due');

        $due = $followUp()
            ->where('next_task_due', '<=', $today)
            ->with('guest:id,full_name,company,email')
            ->orderBy('next_task_due')
            ->limit(self::LIST_LIMIT)
            ->get(['id', 'guest_id', 'status', 'source', 'total_value', 'next_task_type', 'next_task_due', 'next_task_notes', 'assigned_to']);

        $new = Inquiry::query()
            ->where('created_at', '>=', now()->subDay())
            ->with('guest:id,full_name,company,email')
            ->orderByDesc('created_at')
            ->limit(self::LIST_LIMIT)
            ->get(['id', 'guest_id', 'status', 'source', 'total_value', 'created_at']);

        return [
            'open'        => $open()->count(),
            'new'         => Inquiry::query()->where('created_at', '>=', now()->subDay())->count(),
            'due_today'   => $followUp()->where('next_task_due', $today)->count(),
            'overdue'     => $followUp()->where('next_task_due', '<', $today)->count(),
            'follow_ups'  => $due->map(fn (Inquiry $i) => [
                'id'        => (int) $i->id,
                'name'      => $i->guest?->full_name ?: ($i->guest?->email ?: null),
                'company'   => $i->guest?->company ?: null,
                'status'    => (string) $i->status,
                'value'     => $i->total_value !== null ? (float) $i->total_value : null,
                'task_type' => $i->next_task_type,
                'task_note' => $i->next_task_notes ? mb_substr((string) $i->next_task_notes, 0, 160) : null,
                'due'       => $i->next_task_due?->toDateString(),
                'overdue'   => $i->next_task_due !== null && $i->next_task_due->toDateString() < $today,
            ])->values()->all(),
            'new_list'    => $new->map(fn (Inquiry $i) => [
                'id'         => (int) $i->id,
                'name'       => $i->guest?->full_name ?: ($i->guest?->email ?: null),
                'company'    => $i->guest?->company ?: null,
                'status'     => (string) $i->status,
                'source'     => $i->source,
                'value'      => $i->total_value !== null ? (float) $i->total_value : null,
                'created_at' => $i->created_at?->toIso8601String(),
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function tasks(User $user, CarbonImmutable $dayStarts, CarbonImmutable $dayEnds): array
    {
        $mine = fn () => Task::query()->whereNull('completed_at')->where('assigned_to', $user->id)->whereNotNull('due_at');

        $rows = $mine()
            ->where('due_at', '<=', $dayEnds)
            ->with(['inquiry:id,guest_id', 'inquiry.guest:id,full_name'])
            ->orderBy('due_at')
            ->limit(self::LIST_LIMIT)
            ->get(['id', 'type', 'title', 'due_at', 'inquiry_id', 'guest_id']);
        $guests = Guest::query()->whereIn('id', $rows->pluck('guest_id')->filter()->unique())->pluck('full_name', 'id');

        return [
            'due_today' => $mine()->whereBetween('due_at', [$dayStarts, $dayEnds])->count(),
            'overdue'   => $mine()->where('due_at', '<', $dayStarts)->count(),
            'list'      => $rows->map(fn (Task $t) => [
                'id'         => (int) $t->id,
                'type'       => $t->type,
                'title'      => (string) $t->title,
                'due_at'     => $t->due_at?->toIso8601String(),
                'overdue'    => $t->due_at !== null && $t->due_at->lt($dayStarts),
                'inquiry_id' => $t->inquiry_id ? (int) $t->inquiry_id : null,
                'guest_id'   => $t->guest_id ? (int) $t->guest_id : null,
                'contact'    => ($t->guest_id ? ($guests[$t->guest_id] ?? null) : null) ?: $t->inquiry?->guest?->full_name,
            ])->values()->all(),
        ];
    }

    /** @return array{open_count: int, open_value: float} The open leads' estimated value (InquiryController::kpis). */
    private function pipeline(): array
    {
        $open = Inquiry::query()->whereNotIn('status', ['Confirmed', 'Lost']);

        return [
            'open_count' => (clone $open)->count(),
            'open_value' => (float) (clone $open)->whereNotNull('total_value')->sum('total_value'),
        ];
    }

    /**
     * The last seven days of the website chat: conversations a visitor wrote in, how many the assistant closed with
     * nobody assigned (ChatbotAnalyticsController's `ai_resolved`), and how many left a lead.
     *
     * @return array{conversations: int, ai_resolved: int, leads_from_chat: int}
     */
    private function week(): array
    {
        $since = now()->subDays(7);
        $engaged = ChatConversation::query()->where('created_at', '>=', $since)->where('messages_count', '>', 0);

        return [
            'conversations'   => (clone $engaged)->count(),
            'ai_resolved'     => (clone $engaged)->where('status', 'resolved')->whereNull('assigned_to')->count(),
            'leads_from_chat' => ChatConversation::query()->where('created_at', '>=', $since)->where('lead_captured', true)->count(),
        ];
    }
}
