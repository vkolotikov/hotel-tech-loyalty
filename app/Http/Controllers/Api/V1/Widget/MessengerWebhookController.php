<?php

namespace App\Http\Controllers\Api\V1\Widget;

use App\Http\Controllers\Controller;
use App\Models\ChatChannelAccount;
use App\Models\ChatConversation;
use App\Services\Channels\MessengerAiResponder;
use App\Services\Channels\MessengerDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Webhook endpoint that Meta calls for every Messenger event on Pages
 * we've subscribed via this app.
 *
 * Two routes share this controller:
 *   GET  /v1/widget/webhooks/messenger  → verification handshake
 *   POST /v1/widget/webhooks/messenger  → event delivery
 *
 * Both are public (no auth middleware) since Meta doesn't authenticate
 * — instead we verify their identity via:
 *   - GET: hub.verify_token matches our `META_WEBHOOK_VERIFY_TOKEN`
 *   - POST: X-Hub-Signature-256 HMAC-SHA256 over the RAW body with our
 *     `META_APP_SECRET`
 *
 * Meta requires a response within 5 seconds or the subscription gets
 * disabled after enough failures. For Phase 1 the receive path is
 * cheap (parse → upsert → return). When AI dispatch lands in Phase 2
 * the heavy work moves to a Laravel job so the webhook stays sub-second.
 *
 * @see MESSENGER_INTEGRATION.md
 */
class MessengerWebhookController extends Controller
{
    public function __construct(
        private readonly MessengerDispatcher $dispatcher,
        private readonly MessengerAiResponder $aiResponder,
    ) {
    }

    /**
     * GET handshake. Meta calls this with hub.mode=subscribe + a verify
     * token we configured in their dashboard. Echo hub.challenge back on
     * success; 403 on mismatch.
     */
    public function verify(Request $request): Response
    {
        $mode      = $request->query('hub_mode');
        $token     = $request->query('hub_verify_token');
        $challenge = $request->query('hub_challenge');

        $expected = (string) config('services.meta.verify_token', '');

        // Meta's docs show the params as `hub.mode` etc. PHP swaps dots
        // for underscores in $_GET, hence the `hub_mode` accessor above.
        // If the user accidentally sent the dotted form (e.g. curl test),
        // fall back to all() so we don't 403 on something that's actually
        // valid.
        if ($mode === null || $token === null || $challenge === null) {
            $all = $request->all();
            $mode      ??= $all['hub.mode']         ?? null;
            $token     ??= $all['hub.verify_token'] ?? null;
            $challenge ??= $all['hub.challenge']    ?? null;
        }

        if ($mode !== 'subscribe' || $expected === '' || !hash_equals($expected, (string) $token)) {
            Log::warning('messenger.webhook.verify_failed', [
                'mode'            => $mode,
                'token_supplied'  => $token !== null,
                'expected_blank'  => $expected === '',
            ]);
            return response('Forbidden', 403);
        }

        // Echo the challenge verbatim. Meta accepts text/plain.
        return response((string) $challenge, 200)
            ->header('Content-Type', 'text/plain');
    }

    /**
     * POST event delivery. Validates HMAC signature BEFORE parsing JSON,
     * then walks entry[].messaging[] and routes each event to the
     * channel dispatcher.
     *
     * Always returns 200 — Meta only respects 200 as "delivered". Any
     * 4xx/5xx triggers retries and eventual subscription disable. We
     * log internal errors but acknowledge to Meta.
     */
    public function receive(Request $request): JsonResponse
    {
        $rawBody = $request->getContent(); // raw bytes — DO NOT use ->all() before this
        $signature = (string) $request->header('X-Hub-Signature-256', '');

        if (!$this->verifySignature($rawBody, $signature)) {
            Log::warning('messenger.webhook.signature_invalid', [
                'signature_supplied' => $signature !== '',
                'body_length'        => strlen($rawBody),
            ]);
            // Return 200 even on invalid sig so Meta doesn't keep retrying
            // a payload we'll never accept. Logging captures the anomaly.
            return response()->json(['status' => 'ignored']);
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload) || ($payload['object'] ?? null) !== 'page') {
            return response()->json(['status' => 'ignored']);
        }

        foreach (($payload['entry'] ?? []) as $entry) {
            $pageId = (string) ($entry['id'] ?? '');
            if ($pageId === '') continue;

            // Cross-tenant lookup — webhooks don't carry our org context,
            // so the Page ID is the only routing key. Find the active
            // ChatChannelAccount for it, ignoring tenant scope.
            $account = ChatChannelAccount::query()
                ->withoutGlobalScopes()
                ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
                ->where('external_id', $pageId)
                ->where('status', ChatChannelAccount::STATUS_ACTIVE)
                ->first();

            if ($account === null) {
                Log::info('messenger.webhook.no_account', ['page_id' => $pageId]);
                continue;
            }

            foreach (($entry['messaging'] ?? []) as $messaging) {
                try {
                    // Phase 2 — status receipts. message_deliveries arrives
                    // when Meta hands the message to the recipient's device;
                    // message_reads when they actually read it. We stamp
                    // chat_messages.is_read for the latter so the engagement
                    // drawer shows blue-tick UI. Deliveries are best-effort
                    // logged only (no UI for them yet).
                    if (isset($messaging['read'])) {
                        $this->handleReadReceipt($account, $messaging);
                        continue;
                    }
                    if (isset($messaging['delivery'])) {
                        // Acked to wire, no further action — keep returning
                        // 200 so Meta doesn't retry. Future: surface count
                        // on the engagement row as a delivered tick.
                        continue;
                    }
                    if (!isset($messaging['message']) && !isset($messaging['postback'])) {
                        continue;
                    }
                    $inbound = $this->dispatcher->handleIncoming($account, $messaging);

                    // Phase-2 piece the dispatcher always pointed at but
                    // never landed: fire the AI auto-reply on every fresh
                    // inbound. Skipped silently when the inbound is a
                    // dedup hit (null), an empty event (null), or the
                    // conversation has ai_enabled=false. Never throws —
                    // the responder catches its own errors and audit-logs.
                    if ($inbound !== null) {
                        $conversation = ChatConversation::query()
                            ->withoutGlobalScopes()
                            ->where('id', $inbound->conversation_id)
                            ->first();
                        if ($conversation !== null) {
                            $this->aiResponder->respond($account, $conversation, $inbound);
                        }
                    }
                } catch (\Throwable $e) {
                    // Per-event try/catch so one malformed entry doesn't
                    // abort the whole batch (Meta sends batches up to 1000).
                    Log::error('messenger.webhook.handle_failed', [
                        'page_id' => $pageId,
                        'error'   => $e->getMessage(),
                        'trace'   => $e->getTraceAsString(),
                    ]);
                }
            }
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Mark every outbound message in the conversation as read up to the
     * `read.watermark` ms timestamp Meta gives us.
     *
     * Why watermark-based: Meta sends one `read` event per Page→user thread
     * (not per message), with a millisecond cutoff. Every outbound message
     * the agent or AI sent up to that cutoff is now read. We bulk-update
     * chat_messages.is_read accordingly.
     */
    private function handleReadReceipt(\App\Models\ChatChannelAccount $account, array $messaging): void
    {
        $psid       = (string) ($messaging['sender']['id'] ?? '');
        $watermark  = (int)    ($messaging['read']['watermark'] ?? 0);
        if ($psid === '' || $watermark <= 0) return;

        $conversation = \App\Models\ChatConversation::query()
            ->withoutGlobalScopes()
            ->where('channel_account_id', $account->id)
            ->where('external_thread_id', $psid)
            ->first();
        if ($conversation === null) return;

        $cutoff = \Carbon\Carbon::createFromTimestampMs($watermark);

        \App\Models\ChatMessage::query()
            ->withoutGlobalScopes()
            ->where('conversation_id', $conversation->id)
            ->where('direction', \App\Models\ChatMessage::DIRECTION_OUTBOUND)
            ->where('is_read', false)
            ->where('created_at', '<=', $cutoff)
            ->update(['is_read' => true]);
    }

    /**
     * Verify the X-Hub-Signature-256 header against the raw body using
     * HMAC-SHA256 + our App Secret. Constant-time compare.
     *
     * Header format: `sha256=<hex>`. Missing App Secret = fail closed
     * (never accept signed payloads when we can't verify them).
     */
    private function verifySignature(string $rawBody, string $signature): bool
    {
        $secret = (string) config('services.meta.app_secret', '');
        if ($secret === '') {
            return false; // fail closed — production must have the secret set
        }
        if (!str_starts_with($signature, 'sha256=')) {
            return false;
        }
        $supplied = substr($signature, 7);
        $expected = hash_hmac('sha256', $rawBody, $secret);
        return hash_equals($expected, $supplied);
    }
}
