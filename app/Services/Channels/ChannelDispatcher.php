<?php

namespace App\Services\Channels;

use App\Models\ChatChannelAccount;
use App\Models\ChatConversation;
use App\Models\ChatMessage;

/**
 * Contract for external chat channel adapters (Messenger, WhatsApp,
 * Instagram). Implementations are stateless — they accept a connected
 * ChatChannelAccount and a conversation, and route outbound messages
 * to the channel's API or inbound webhook payloads back into our chat
 * tables.
 *
 * The interface intentionally stays narrow:
 *   - handleIncoming() takes a parsed Meta entry+messaging row and
 *     returns the persisted ChatMessage (or null if it was deduped).
 *   - send() takes a plain text + optional attachments and returns the
 *     external channel's message id.
 *
 * AI dispatch, KB lookups, and the engagement feed don't go through
 * this interface — they keep working at the ChatConversation level
 * regardless of channel.
 *
 * @see App\Services\Channels\MessengerDispatcher
 */
interface ChannelDispatcher
{
    /**
     * Persist an inbound message from the channel.
     *
     * Idempotent on (channel_account_id, channel_message_id). Returns the
     * ChatMessage row, or NULL if the message was a duplicate (e.g. Meta
     * retry) and was silently dropped.
     *
     * Conversation is resolved by (channel_account_id, external_thread_id);
     * a new conversation row is created if it's the visitor's first message.
     *
     * @param ChatChannelAccount $account The connected account that received the webhook
     * @param array $payload Channel-specific normalised payload (see implementations)
     */
    public function handleIncoming(ChatChannelAccount $account, array $payload): ?ChatMessage;

    /**
     * Send a message via the channel's outbound API.
     *
     * Caller is responsible for window-rule enforcement (24h for Messenger
     * standard reply, 7d for HUMAN_AGENT tagged human-agent reply). The
     * dispatcher itself is a thin transport.
     *
     * @param ChatConversation $conversation The local conversation to send into
     * @param string $text Plain text body. Channel-specific length limits apply.
     * @param array{type:string,url:string}[]|null $attachments Optional attachment list
     * @param array $opts Channel-specific options (e.g. ['messaging_type'=>'MESSAGE_TAG','tag'=>'HUMAN_AGENT'] for Messenger past-window agent reply)
     *
     * @return string The channel's message id (e.g. Meta's mid.*)
     *
     * @throws \RuntimeException on transport failure (caller decides whether to retry)
     */
    public function send(ChatConversation $conversation, string $text, ?array $attachments = null, array $opts = []): string;

    /**
     * Channel identifier this dispatcher handles ('messenger', 'whatsapp', 'instagram').
     */
    public function channel(): string;
}
