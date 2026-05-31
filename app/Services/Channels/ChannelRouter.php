<?php

namespace App\Services\Channels;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * ChannelRouter — single entrypoint for sending outbound messages on
 * conversations that live on external channels (Messenger now, WhatsApp
 * and Instagram later).
 *
 * Why this exists:
 *
 * Phase 1 wired the inbound webhook → dispatcher path. Phase 2 needs
 * the OUTBOUND path (AI auto-reply, admin manual reply) to dispatch
 * via the right channel's Send API when the conversation isn't on
 * the web widget.
 *
 * Callers (WidgetChatController for AI replies, ChatInboxController
 * for admin replies) persist the ChatMessage locally as before, then
 * call ChannelRouter::sendOutbound() to forward it. Local persistence
 * stays the authoritative record even if the external send fails —
 * the admin still sees what they sent, and any failure is surfaced
 * via the channel-account's last_error column for ops.
 *
 * Design notes:
 *
 *   - Web-widget conversations (channel='widget' or 'web', or NULL)
 *     return immediately — no external API call, the widget polls
 *     and the visitor sees the message that way.
 *   - For Messenger:
 *       * Within the 24h window (last inbound < 24h ago) → standard
 *         RESPONSE messaging_type.
 *       * Past 24h, when sender is human/agent → HUMAN_AGENT tag
 *         (extends to 7 days; AI replies are blocked past window).
 *       * Past window with no human-agent eligibility → blocked.
 *   - Failures don't bubble up. The caller has already persisted the
 *     ChatMessage; surfacing the failure as an exception would
 *     interrupt their flow. Errors are logged + recorded on the
 *     ChannelAccount (markError() / clearError()), surfaced to the
 *     admin via the Settings panel when Phase 3 ships.
 *
 * @see App\Services\Channels\ChannelDispatcher
 * @see App\Services\Channels\MessengerDispatcher
 */
class ChannelRouter
{
    /** @var array<string, ChannelDispatcher> */
    private array $dispatchers = [];

    public function __construct(MessengerDispatcher $messenger)
    {
        $this->register($messenger);
        // Future: WhatsAppDispatcher, InstagramDispatcher get added here.
    }

    public function register(ChannelDispatcher $dispatcher): void
    {
        $this->dispatchers[$dispatcher->channel()] = $dispatcher;
    }

    /**
     * @return ChannelDispatcher|null Returns null when the channel is
     *   internal (widget/web) — caller should skip external send.
     */
    public function for(ChatConversation $conversation): ?ChannelDispatcher
    {
        $channel = (string) ($conversation->channel ?? '');
        if ($channel === '' || $channel === 'widget' || $channel === 'web' || $channel === 'mobile') {
            return null;
        }
        return $this->dispatchers[$channel] ?? null;
    }

    /**
     * Send an outbound message on the conversation's external channel,
     * if any. Records the external message id back on the ChatMessage
     * row for status tracking (Phase 2 deliveries/reads webhooks key on it).
     *
     * Returns true if dispatched (or skipped intentionally for internal
     * channels — caller doesn't need to distinguish). Returns false only
     * on hard failure (window expired + no fallback, or transport error
     * the caller might want to know about). Today no caller actually
     * branches on the return value.
     *
     * @param 'ai'|'agent'|'system' $senderKind Used for window-rule decisions
     */
    public function sendOutbound(
        ChatConversation $conversation,
        ChatMessage $message,
        string $senderKind = 'agent',
        ?array $attachments = null,
    ): bool {
        $dispatcher = $this->for($conversation);
        if ($dispatcher === null) {
            return true; // internal channel — nothing to do, signal "fine"
        }

        // Load the linked account WITHOUT global scopes. We're often called
        // from contexts that don't have a tenant bound (console commands,
        // queued jobs, cross-tenant webhook handlers), and BelongsToOrganization's
        // TenantScope is fail-closed — it would return null and we'd silently
        // refuse to send. Look up directly by id then prime the relation so
        // the dispatcher doesn't repeat the work.
        $account = $conversation->channel_account_id !== null
            ? \App\Models\ChatChannelAccount::query()
                ->withoutGlobalScopes()
                ->find($conversation->channel_account_id)
            : null;
        if ($account === null || !$account->isActive()) {
            Log::warning('channel_router.skipped.no_active_account', [
                'conversation_id' => $conversation->id,
                'channel'         => $conversation->channel,
                'channel_account_id' => $conversation->channel_account_id,
                'account_status'  => $account?->status,
            ]);
            return false;
        }
        $conversation->setRelation('channelAccount', $account);

        // Window-rule enforcement (Messenger-specific for now; the
        // dispatcher interface stays channel-agnostic. WhatsApp's window
        // rules differ and that dispatcher will check them itself.)
        $opts = [];
        if ($conversation->channel === 'messenger') {
            $opts = $this->buildMessengerSendOpts($conversation, $senderKind);
            if ($opts === null) {
                Log::info('channel_router.blocked.window_expired', [
                    'conversation_id' => $conversation->id,
                    'sender_kind'     => $senderKind,
                ]);
                return false;
            }
        }

        try {
            $externalMid = $dispatcher->send($conversation, $message->content, $attachments, $opts);
            if ($externalMid !== '') {
                $message->forceFill([
                    'channel_message_id' => $externalMid,
                    'direction'          => ChatMessage::DIRECTION_OUTBOUND,
                ])->saveQuietly();
            }
            return true;
        } catch (Throwable $e) {
            Log::error('channel_router.send_failed', [
                'conversation_id' => $conversation->id,
                'message_id'      => $message->id,
                'channel'         => $conversation->channel,
                'error'           => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Decide which messaging_type/tag to send with based on the 24-hour
     * window state and who's sending.
     *
     * Returns null when the send would violate Meta's window rules and
     * there's no legal fallback for this sender kind. Returns an opts
     * array suitable for MessengerDispatcher::send() otherwise.
     */
    private function buildMessengerSendOpts(ChatConversation $conversation, string $senderKind): ?array
    {
        $lastInbound = $this->lastInboundAt($conversation);
        $hoursSince = $lastInbound !== null
            ? $lastInbound->diffInHours(now(), false)
            : PHP_INT_MAX;

        if ($hoursSince < 24) {
            // Within window — anything goes, free.
            return ['messaging_type' => 'RESPONSE'];
        }

        // Outside 24h. Agents (human staff) can still reply up to 7 days
        // via the HUMAN_AGENT tag. AI auto-replies cannot; refusing the
        // send is the correct behaviour.
        if ($senderKind === 'agent' && $hoursSince < 168) {
            return [
                'messaging_type' => 'MESSAGE_TAG',
                'tag'            => 'HUMAN_AGENT',
            ];
        }

        // No legal path — caller logs + skips.
        return null;
    }

    /**
     * Most recent inbound (from-user) message timestamp on the conversation.
     * Used by buildMessengerSendOpts() to decide the window state.
     *
     * Pulled inline rather than denormalised on ChatConversation so the
     * value is always current — and it's a cheap indexed lookup
     * (conversation_id + direction are both indexed on chat_messages).
     */
    private function lastInboundAt(ChatConversation $conversation): ?\DateTimeInterface
    {
        $row = ChatMessage::query()
            ->withoutGlobalScopes()
            ->where('conversation_id', $conversation->id)
            ->where('direction', ChatMessage::DIRECTION_INBOUND)
            ->orderByDesc('created_at')
            ->select('created_at')
            ->first();
        return $row?->created_at;
    }
}
