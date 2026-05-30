<?php

namespace App\Services\Channels;

use App\Models\ChatChannelAccount;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Visitor;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Facebook Messenger Platform adapter.
 *
 * Inbound: parses Meta's webhook entry+messaging row, dedupes via
 * channel_message_id, upserts (channel_account_id, external_thread_id)
 * → conversation, persists the ChatMessage as 'visitor'/inbound.
 *
 * Outbound: POSTs to `/<PAGE_ID>/messages` on the Graph API with the
 * stored Page access token. Window-rule enforcement is the caller's
 * job (see ChannelDispatcher contract).
 *
 * Graph API version is pinned via `services.meta.graph_version`
 * env. v25.0 as of May 2026 — see MESSENGER_INTEGRATION.md.
 *
 * Permissions required on the Page access token:
 *   - pages_messaging   (Send API)
 *   - pages_manage_metadata (subscribed_apps edge, done at connect time)
 *
 * @see MESSENGER_INTEGRATION.md
 */
class MessengerDispatcher implements ChannelDispatcher
{
    public function channel(): string
    {
        return ChatChannelAccount::CHANNEL_MESSENGER;
    }

    public function handleIncoming(ChatChannelAccount $account, array $payload): ?ChatMessage
    {
        // Expected payload shape (one element from entry[].messaging[]):
        //   sender.id         → PSID (our external_thread_id)
        //   recipient.id      → PAGE_ID (must equal $account->external_id)
        //   timestamp         → ms since epoch
        //   message.mid       → Meta's unique message id (dedup key)
        //   message.text      → optional text body
        //   message.attachments[].{type,payload.url} → optional media
        //   postback?         → for button clicks (treated as text for v1)

        $psid = (string) ($payload['sender']['id'] ?? '');
        if ($psid === '') {
            return null; // unrecognised shape — drop silently
        }
        $pageId = (string) ($payload['recipient']['id'] ?? '');
        if ($pageId !== '' && $pageId !== $account->external_id) {
            // Defensive: this webhook arrived on the wrong account. Should
            // not happen if the resolver routes correctly, but log if it does.
            Log::warning('messenger.incoming.page_mismatch', [
                'expected' => $account->external_id,
                'actual'   => $pageId,
                'account_id' => $account->id,
            ]);
            return null;
        }

        // Idempotency: same mid arriving twice (Meta retries on 5xx, network
        // glitches) is a no-op. Cheap pre-check before any conversation
        // upsert work.
        $mid = (string) ($payload['message']['mid'] ?? $payload['postback']['mid'] ?? '');
        if ($mid !== '') {
            $existing = ChatMessage::query()
                ->where('channel_message_id', $mid)
                ->first();
            if ($existing !== null) {
                return null; // duplicate webhook — silently drop
            }
        }

        // Conversation upsert. Lock to avoid the race when Meta fires two
        // webhooks back-to-back for the same PSID and we'd otherwise create
        // two conversation rows.
        return DB::transaction(function () use ($account, $payload, $psid, $mid) {
            $conversation = ChatConversation::query()
                ->where('channel_account_id', $account->id)
                ->where('external_thread_id', $psid)
                ->lockForUpdate()
                ->first();

            if ($conversation === null) {
                $conversation = ChatConversation::create([
                    'organization_id'    => $account->organization_id,
                    'brand_id'           => $account->brand_id,
                    'channel'            => ChatChannelAccount::CHANNEL_MESSENGER,
                    'external_thread_id' => $psid,
                    'channel_account_id' => $account->id,
                    // Default AI on — matches the agreed product behaviour
                    // for FB DMs (auto-reply unless admin takes over).
                    'ai_enabled'         => true,
                    'status'             => 'active',
                    'visitor_name'       => 'Messenger user',
                    'visitor_country'    => null,
                    // Source signal so the engagement row shows a Messenger
                    // badge instead of the web-widget badge.
                    'session_id'         => 'fb_' . $psid,
                    'last_message_at'    => now(),
                ]);
            }

            // Build the inbound message.
            $body = (string) ($payload['message']['text']
                ?? $payload['postback']['title']
                ?? '');
            $attachments = $this->normaliseAttachments($payload['message']['attachments'] ?? []);
            if ($body === '' && empty($attachments)) {
                // No text + no media. Could be a reaction, read receipt, or
                // other event we don't handle. Don't create an empty row.
                return null;
            }

            try {
                $message = ChatMessage::create([
                    'organization_id'    => $account->organization_id,
                    'conversation_id'    => $conversation->id,
                    'sender_type'        => 'visitor',
                    'direction'          => ChatMessage::DIRECTION_INBOUND,
                    'content'            => $body,
                    'content_type'       => empty($attachments) ? 'text' : 'media',
                    'is_read'            => false,
                    'channel_message_id' => $mid !== '' ? $mid : null,
                    'attachments_data'   => $attachments ?: null,
                    'metadata'           => $payload,
                    'created_at'         => isset($payload['timestamp'])
                        ? now()->createFromTimestampMs((int) $payload['timestamp'])
                        : now(),
                ]);
            } catch (QueryException $e) {
                // Unique-index violation = duplicate that slipped past the
                // pre-check (two webhooks arriving simultaneously). Return
                // null — the winner's row is the source of truth.
                if (str_contains($e->getMessage(), 'duplicate') || $e->getCode() === '23505') {
                    return null;
                }
                throw $e;
            }

            // Bump conversation counters in the same transaction so the
            // engagement feed stays consistent.
            $conversation->increment('messages_count');
            $conversation->forceFill([
                'last_message_at' => $message->created_at,
                'status'          => 'active',
            ])->save();

            $account->markWebhookReceived();
            return $message;
        });
    }

    public function send(ChatConversation $conversation, string $text, ?array $attachments = null, array $opts = []): string
    {
        $account = $conversation->relationLoaded('channelAccount')
            ? $conversation->getRelation('channelAccount')
            : ChatChannelAccount::find($conversation->channel_account_id);

        if ($account === null || !$account->isActive()) {
            throw new RuntimeException('Messenger account is not active for this conversation');
        }

        $psid = $conversation->external_thread_id;
        if ($psid === null || $psid === '') {
            throw new RuntimeException('Conversation has no Messenger PSID');
        }

        $url = sprintf(
            '%s/%s/%s/messages',
            rtrim(config('services.meta.graph_url', 'https://graph.facebook.com'), '/'),
            config('services.meta.graph_version', 'v25.0'),
            $account->external_id,
        );

        $messagingType = $opts['messaging_type'] ?? 'RESPONSE';
        $body = [
            'recipient'      => ['id' => $psid],
            'messaging_type' => $messagingType,
            'message'        => $this->buildMessageBody($text, $attachments),
        ];
        // HUMAN_AGENT extends the window to 7 days for human-agent replies.
        // RESPONSE is the default for AI / quick replies within the 24h window.
        if ($messagingType === 'MESSAGE_TAG' && isset($opts['tag'])) {
            $body['tag'] = $opts['tag'];
        }

        $response = Http::timeout(15)
            ->retry(2, 250, throw: false)
            ->withQueryParameters(['access_token' => $account->page_access_token])
            ->acceptJson()
            ->asJson()
            ->post($url, $body);

        if (!$response->successful()) {
            $err = $response->json();
            $msg = $err['error']['message']
                ?? sprintf('Messenger Send API %d', $response->status());
            $account->markError($msg);
            throw new RuntimeException("Messenger send failed: {$msg}");
        }

        $account->clearError();

        $mid = (string) ($response->json('message_id') ?? '');
        return $mid;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    /**
     * Reduce Meta's attachment shape to our normalised view. Stored on
     * chat_messages.attachments_data so we don't have to re-parse the
     * raw `metadata` blob to render.
     *
     * Meta CDN URLs expire — Phase 1 stores them as-is and a background
     * job (Phase 2) mirrors to DO Spaces. For v1 receive testing the raw
     * URLs are fine.
     */
    private function normaliseAttachments(array $atts): array
    {
        $out = [];
        foreach ($atts as $a) {
            $type = (string) ($a['type'] ?? 'file');
            $url  = (string) ($a['payload']['url'] ?? '');
            if ($url === '') continue;
            $out[] = [
                'type' => $type, // image, video, audio, file, location, fallback
                'url'  => $url,
                'original_meta_url' => $url,
                'mirrored_url'      => null, // filled by attachment-mirroring job (Phase 2)
            ];
        }
        return $out;
    }

    /**
     * Build the `message` body for the Send API. Text + first attachment
     * if both present (Messenger can carry one attachment per message;
     * additional ones become subsequent sends — Phase 2 concern).
     */
    private function buildMessageBody(string $text, ?array $attachments): array
    {
        $first = is_array($attachments) ? ($attachments[0] ?? null) : null;
        if ($first !== null && isset($first['type'], $first['url'])) {
            return [
                'attachment' => [
                    'type'    => $first['type'],
                    'payload' => [
                        'url'         => $first['url'],
                        'is_reusable' => true,
                    ],
                ],
            ];
        }
        return ['text' => $text];
    }
}
