<?php

namespace App\Http\Controllers\Api\V1\Widget;

use App\Http\Controllers\Controller;
use App\Models\ChatChannelAccount;
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
                    // Skip delivery + read receipts in Phase 1 — they're useful
                    // for read-status UI but not for the receive path.
                    if (isset($messaging['delivery']) || isset($messaging['read'])) {
                        continue;
                    }
                    if (!isset($messaging['message']) && !isset($messaging['postback'])) {
                        continue;
                    }
                    $this->dispatcher->handleIncoming($account, $messaging);
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
