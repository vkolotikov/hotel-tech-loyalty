<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\ChatChannelAccount;
use App\Models\Organization;
use App\Services\Channels\MessengerOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * MessengerIntegrationController — admin endpoints behind the
 * Settings → Integrations → "Connect Facebook Page" UI.
 *
 * All endpoints require admin auth (mounted under `auth:sanctum` +
 * `admin` middleware). Tenant is bound by middleware so org-scoping
 * Just Works for the model queries here.
 *
 * Cleanly separated from the public webhook controller — that one
 * runs without auth and routes by Page ID. This one runs WITH auth
 * and scopes by current org.
 */
class MessengerIntegrationController extends Controller
{
    public function __construct(
        private readonly MessengerOnboardingService $service,
    ) {
    }

    /**
     * GET /v1/admin/integrations/messenger/config
     *
     * Returns the public Meta App ID + readiness flag for the React
     * panel to initialise the FB JS SDK. App Secret is NEVER returned.
     */
    public function config(Request $request): JsonResponse
    {
        $appId = (string) config('services.meta.app_id', '');
        $graphVersion = (string) config('services.meta.graph_version', 'v25.0');

        return response()->json([
            'configured'       => $appId !== '' && config('services.meta.app_secret') !== null && config('services.meta.app_secret') !== '',
            'app_id'           => $appId,                                  // safe to expose; embeds in client-side JS
            'graph_version'    => $graphVersion,
            // business_management is needed to enumerate Pages shared via
            // Facebook Login for Business asset-sharing — without it,
            // /me/businesses + the per-business owned_pages / client_pages
            // endpoints return zero rows and the customer sees an empty
            // list even after granting every other scope. NOTE: adding
            // this scope requires Meta App Review approval; the code
            // change is harmless before approval (Meta just declines to
            // grant it in the FB.login dialog).
            'required_scopes'  => ['pages_show_list', 'pages_messaging', 'pages_manage_metadata', 'business_management'],
            'subscribed_fields' => ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads'],
        ]);
    }

    /**
     * GET /v1/admin/integrations/messenger
     *
     * Lists Messenger ChatChannelAccount rows for the current org. The
     * model's TenantScope global scope handles the org filter.
     */
    public function index(Request $request): JsonResponse
    {
        $accounts = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->orderBy('id', 'desc')
            ->get()
            ->map(fn (ChatChannelAccount $a) => $this->serialize($a));

        return response()->json(['data' => $accounts]);
    }

    /**
     * POST /v1/admin/integrations/messenger/list-pages
     *
     * Takes a short-lived user access token from the JS SDK,
     * exchanges it for a long-lived one, and returns the user's
     * manageable Pages (filtered to those where they have the
     * MESSAGING / MANAGE task). Body:
     *   { user_token: "EAAB..." }
     *
     * Stateless from our DB's perspective — nothing is persisted at
     * this stage. The user picks a Page from the response and we
     * proceed to /connect.
     */
    public function listPages(Request $request): JsonResponse
    {
        $request->validate([
            'user_token' => 'required|string|min:20',
        ]);

        try {
            // exchangeUserToken returns an array since the FBLB
            // hardening — we only need the bare token here for the
            // Pages call, but the debug fields are also exposed in
            // the response so the admin UI can surface what scopes
            // Meta actually granted vs what was requested.
            $exchange = $this->service->exchangeUserToken($request->input('user_token'));
            $pages    = $this->service->listManageablePages($exchange['token']);
        } catch (RuntimeException $e) {
            return response()->json([
                'error' => 'meta_call_failed',
                'message' => $e->getMessage(),
            ], 400);
        }

        // Annotate already-connected Pages so the UI can show
        // "Connected" instead of "Connect" for those.
        $connectedIds = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->whereIn('external_id', array_column($pages, 'id'))
            ->pluck('external_id')
            ->toArray();

        foreach ($pages as &$p) {
            $p['already_connected'] = in_array($p['id'], $connectedIds, true);
        }
        unset($p);

        return response()->json([
            'data' => $pages,
            // Surface what Meta actually granted on the user token — the
            // admin UI can warn "you requested X but Meta only granted Y"
            // when the lists diverge. Useful for debugging FBLB onboarding
            // where the customer thinks they granted everything.
            'token' => [
                'scopes'                 => $exchange['scopes'] ?? [],
                'granular_scopes'        => $exchange['granular_scopes'] ?? [],
                'expires_at'             => $exchange['expires_at'] ?? null,
                'data_access_expires_at' => $exchange['data_access_expires_at'] ?? null,
            ],
        ]);
    }

    /**
     * POST /v1/admin/integrations/messenger
     *
     * Creates (or updates) a ChatChannelAccount + subscribes the Page
     * to our app's webhook. Body:
     *   {
     *     page_id: "818000171669778",
     *     page_token: "EAAB...",
     *     brand_id: 5,                // optional; defaults to first brand in org
     *     display_name: "FDS Cards",  // optional; from the Page list response
     *     avatar_url: "https://..."   // optional
     *   }
     *
     * Returns the saved account row in the same shape as index().
     */
    public function connect(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page_id'      => 'required|string|max:64',
            'page_token'   => 'required|string|min:20',
            'brand_id'     => 'nullable|integer',
            'display_name' => 'nullable|string|max:255',
            // Facebook CDN avatar URLs are signed (embedded auth tokens)
            // and routinely 700-1500 chars. 2048 is a defensive ceiling
            // — the column itself is TEXT (migration 2026_06_02_130000).
            // The old max:500 cap rejected every FBLB connect attempt.
            'avatar_url'   => 'nullable|url|max:2048',
        ]);

        $user = $request->user();
        $org  = Organization::query()->findOrFail($user->organization_id);

        $brand = isset($data['brand_id'])
            ? Brand::query()->where('organization_id', $org->id)->find($data['brand_id'])
            : Brand::query()->where('organization_id', $org->id)->orderBy('id')->first();
        if ($brand === null) {
            return response()->json([
                'error'   => 'brand_required',
                'message' => 'No brand found for the current org. Create at least one brand before connecting a Page.',
            ], 422);
        }

        try {
            $account = $this->service->connectPage(
                $org,
                $brand,
                $user,
                $data['page_id'],
                $data['page_token'],
                $data['display_name'] ?? null,
                $data['avatar_url'] ?? null,
            );
        } catch (RuntimeException $e) {
            return response()->json([
                'error'   => 'meta_call_failed',
                'message' => $e->getMessage(),
            ], 400);
        }

        return response()->json($this->serialize($account), 201);
    }

    /**
     * POST /v1/admin/integrations/messenger/{id}/reconnect
     *
     * Re-attach a fresh Page Access Token to an existing connection,
     * useful when the customer's token died (status=reauth_required)
     * and they ran through Facebook Login again. Body:
     *   { page_token: "EAAB..." }
     *
     * Distinct from a brand-new connect — keeps brand_id + display_name
     * intact, just swaps the credential.
     */
    public function reconnect(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'page_token' => 'required|string|min:20',
        ]);

        $account = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->findOrFail($id);

        $account->forceFill([
            'page_access_token' => $data['page_token'],
            'status'            => ChatChannelAccount::STATUS_ACTIVE,
            'token_verified_at' => now(),
            'last_error'        => null,
        ])->save();

        try {
            $this->service->subscribePageWebhooks($account);
        } catch (RuntimeException $e) {
            $account->markError("Webhook re-subscribe failed: {$e->getMessage()}");
            return response()->json([
                'error'   => 'meta_call_failed',
                'message' => $e->getMessage(),
            ], 400);
        }

        return response()->json($this->serialize($account->refresh()));
    }

    /**
     * POST /v1/admin/integrations/messenger/{id}/verify
     *
     * Force a token-health check. Used by the panel's "Refresh status"
     * button + by ops. Returns the updated account row.
     */
    public function verify(Request $request, int $id): JsonResponse
    {
        $account = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->findOrFail($id);

        $this->service->checkTokenHealth($account);

        return response()->json($this->serialize($account->refresh()));
    }

    /**
     * POST /v1/admin/integrations/messenger/{id}/diagnose
     *
     * End-to-end Messenger pipeline check for one Page. Returns a
     * structured checklist that the admin UI renders as a traffic-light
     * panel — every check has an actionable detail + next-step hint
     * when failing. Helps the customer self-diagnose "I connected but
     * messages don't arrive" without spelunking the Meta dashboard.
     *
     * Checks:
     *   1. Token health    (uses MessengerOnboardingService::checkTokenHealth)
     *   2. Page subscription state (GET /<page_id>/subscribed_apps on Meta)
     *   3. 'messages' field actually subscribed (most common silent failure)
     *   4. Last webhook receipt — if "never" + token is healthy + subscription
     *      is fine, points the user at Meta App Review (Dev Mode app webhooks
     *      only fire for Role users).
     */
    public function diagnose(Request $request, int $id): JsonResponse
    {
        $account = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->findOrFail($id);

        $checks = [];

        // 1. Token health
        try {
            $this->service->checkTokenHealth($account);
            $account->refresh();
            $checks[] = [
                'key'    => 'token',
                'label'  => 'Page access token',
                'status' => $account->status === ChatChannelAccount::STATUS_ACTIVE ? 'ok' : 'fail',
                'detail' => $account->status === ChatChannelAccount::STATUS_ACTIVE
                    ? 'Token is valid and responds to Meta /me.'
                    : ($account->last_error ?: 'Token check failed.'),
                'fix'    => $account->status === ChatChannelAccount::STATUS_ACTIVE ? null
                    : 'Click "Reconnect" and run the Facebook Login flow again to get a fresh page token.',
            ];
        } catch (\Throwable $e) {
            $checks[] = [
                'key' => 'token', 'label' => 'Page access token', 'status' => 'fail',
                'detail' => 'Token check threw: ' . $e->getMessage(),
                'fix' => 'Click "Reconnect" to get a fresh page token.',
            ];
        }

        // 2 + 3. Meta-side subscription
        $expectedAppId = (string) config('services.meta.app_id', '');
        try {
            $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
            $ver  = (string) config('services.meta.graph_version', 'v25.0');
            $resp = \Illuminate\Support\Facades\Http::timeout(10)
                ->withQueryParameters(['access_token' => $account->page_access_token])
                ->acceptJson()
                ->get("{$base}/{$ver}/{$account->external_id}/subscribed_apps");

            if (!$resp->successful()) {
                $checks[] = [
                    'key' => 'subscription', 'label' => 'Page → app webhook subscription', 'status' => 'fail',
                    'detail' => 'Meta /subscribed_apps API call failed: ' . ($resp->json('error.message') ?? "HTTP {$resp->status()}"),
                    'fix' => 'Click "Resubscribe to webhooks" below to retry.',
                ];
                $checks[] = [
                    'key' => 'messages_field', 'label' => 'messages field subscribed', 'status' => 'unknown',
                    'detail' => 'Could not verify (upstream subscription check failed).',
                    'fix' => null,
                ];
            } else {
                $subscribedApps = $resp->json('data') ?? [];
                $matched = null;
                foreach ($subscribedApps as $app) {
                    if ((string) ($app['id'] ?? '') === $expectedAppId) {
                        $matched = $app;
                        break;
                    }
                }
                if (!$matched) {
                    $checks[] = [
                        'key' => 'subscription', 'label' => 'Page → app webhook subscription', 'status' => 'fail',
                        'detail' => empty($subscribedApps)
                            ? 'Meta says NO apps are subscribed to this Page.'
                            : 'Our app (id=' . $expectedAppId . ') is not in the subscribed list. Other apps may be — but not ours.',
                        'fix' => 'Click "Resubscribe to webhooks" below.',
                    ];
                    $checks[] = [
                        'key' => 'messages_field', 'label' => 'messages field subscribed', 'status' => 'fail',
                        'detail' => 'Cannot verify until our app is in the subscribed list.',
                        'fix' => null,
                    ];
                } else {
                    $fields = is_array($matched['subscribed_fields'] ?? null) ? $matched['subscribed_fields'] : [];
                    $checks[] = [
                        'key' => 'subscription', 'label' => 'Page → app webhook subscription', 'status' => 'ok',
                        'detail' => 'App subscribed to Page (subscribed_fields=' . (empty($fields) ? '(none)' : implode(', ', $fields)) . ').',
                        'fix' => null,
                    ];
                    $hasMessages = in_array('messages', $fields, true);
                    $checks[] = [
                        'key' => 'messages_field', 'label' => 'messages field subscribed', 'status' => $hasMessages ? 'ok' : 'fail',
                        'detail' => $hasMessages
                            ? "The 'messages' webhook field is active. Inbound DMs will fire on next message."
                            : "App is subscribed to the Page but NOT to the 'messages' field. Inbound DMs WON'T fire.",
                        'fix' => $hasMessages ? null : 'Click "Resubscribe to webhooks" — this re-runs subscribe with the full field set (messages + messaging_postbacks + message_deliveries + message_reads).',
                    ];
                }
            }
        } catch (\Throwable $e) {
            $checks[] = [
                'key' => 'subscription', 'label' => 'Page → app webhook subscription', 'status' => 'fail',
                'detail' => 'Subscription probe threw: ' . $e->getMessage(),
                'fix' => 'Click "Resubscribe to webhooks" to retry.',
            ];
        }

        // 4. Last webhook receipt
        $lastWebhook = $account->last_webhook_at;
        if ($lastWebhook) {
            $checks[] = [
                'key' => 'webhook_activity', 'label' => 'Webhook activity',
                'status' => 'ok',
                'detail' => 'Last webhook arrived ' . $lastWebhook->diffForHumans() . ' (' . $lastWebhook->toDateTimeString() . ').',
                'fix' => null,
            ];
        } else {
            // Token + subscription fine but never received → most likely
            // app is in Development Mode without App Review for messaging.
            $tokenOk = $account->status === ChatChannelAccount::STATUS_ACTIVE;
            $subOk = false;
            foreach ($checks as $c) {
                if ($c['key'] === 'messages_field' && $c['status'] === 'ok') { $subOk = true; break; }
            }
            if ($tokenOk && $subOk) {
                $checks[] = [
                    'key' => 'webhook_activity', 'label' => 'Webhook activity',
                    'status' => 'warn',
                    'detail' => 'No webhooks received yet, but token + subscription look healthy. '
                        . 'Most common cause: Meta app is in Development Mode + not App Review-approved for the messaging permission. '
                        . 'In Development Mode, Meta only forwards webhooks from users with Admin/Developer/Tester roles on the Meta App.',
                    'fix' => '1) Verify your Facebook account has a Role on the Meta App. '
                        . '2) Send a DM from that role-bearing account to the Page. '
                        . '3) OR submit App Review for "Messenger Platform" advanced access to receive webhooks from anyone. '
                        . '4) Meanwhile, click "Send test webhook" to verify the receive pipeline works end-to-end without Meta.',
                ];
            } else {
                $checks[] = [
                    'key' => 'webhook_activity', 'label' => 'Webhook activity',
                    'status' => 'warn',
                    'detail' => 'No webhooks received yet. Resolve the failing checks above first.',
                    'fix' => null,
                ];
            }
        }

        return response()->json([
            'data' => [
                'account_id'      => $account->id,
                'external_id'     => $account->external_id,
                'display_name'    => $account->display_name,
                'status'          => $account->status,
                'last_webhook_at' => $account->last_webhook_at?->toIso8601String(),
                'last_error'      => $account->last_error,
                'meta_app_id'     => $expectedAppId,
                'checks'          => $checks,
            ],
        ]);
    }

    /**
     * POST /v1/admin/integrations/messenger/{id}/resubscribe
     *
     * Re-runs the /<page_id>/subscribed_apps POST with our full field
     * set. Idempotent on Meta's side — safe to click repeatedly.
     */
    public function resubscribe(Request $request, int $id): JsonResponse
    {
        $account = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->findOrFail($id);

        try {
            $this->service->subscribePageWebhooks($account);
            $account->forceFill(['last_error' => null])->save();
        } catch (RuntimeException $e) {
            $account->markError("Webhook re-subscribe failed: {$e->getMessage()}");
            return response()->json([
                'error'   => 'meta_call_failed',
                'message' => $e->getMessage(),
            ], 400);
        }

        return response()->json([
            'status'  => 'resubscribed',
            'detail'  => 'POST /' . $account->external_id . '/subscribed_apps succeeded. Click "Diagnose" to re-check the field list.',
        ]);
    }

    /**
     * POST /v1/admin/integrations/messenger/{id}/simulate-webhook
     *
     * Fires a fabricated inbound DM through MessengerDispatcher
     * directly, bypassing Meta entirely. Lets the customer verify
     * the receive pipeline (visitor creation, conversation upsert,
     * Engagement feed surfacing) works end-to-end before App Review
     * is approved.
     */
    public function simulateWebhook(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'text' => 'nullable|string|max:500',
        ]);

        $account = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->findOrFail($id);

        $text = $data['text'] ?? 'Hello from the admin simulator';
        $psid = 'sim_' . \Illuminate\Support\Str::random(16);
        $mid  = 'sim_mid_' . substr(md5($psid . '|' . $text . '|' . microtime(true)), 0, 24);

        $payload = [
            'sender'    => ['id' => $psid],
            'recipient' => ['id' => $account->external_id],
            'timestamp' => (int) round(microtime(true) * 1000),
            'message'   => ['mid' => $mid, 'text' => $text],
        ];

        try {
            $dispatcher = app(\App\Services\Channels\MessengerDispatcher::class);
            $message = $dispatcher->handleIncoming($account, $payload);
        } catch (\Throwable $e) {
            return response()->json([
                'error'   => 'simulate_failed',
                'message' => 'Dispatcher threw: ' . $e->getMessage(),
            ], 500);
        }

        if ($message === null) {
            return response()->json([
                'status' => 'duplicate',
                'detail' => 'Idempotency dedup hit — the synthesised mid already exists. Retry to get a fresh one (this is the expected guard, not a bug).',
            ]);
        }

        return response()->json([
            'status'  => 'received',
            'detail'  => 'Simulated inbound message persisted (id=' . $message->id . ', conversation_id=' . $message->conversation_id . '). Open /engagement — the row should appear at the top within ~5 sec.',
            'message_id'      => $message->id,
            'conversation_id' => $message->conversation_id,
        ]);
    }

    /**
     * DELETE /v1/admin/integrations/messenger/{id}
     *
     * Disconnect a Page. Removes our local row and (when this was the
     * last row for the Page across all orgs) calls Meta to remove the
     * webhook subscription.
     *
     * Optional query param ?keep_meta_sub=1 forces the disconnect to
     * leave Meta's subscription alone — useful for the rare case where
     * the same Page is connected to multiple orgs (admin in one org
     * disconnects but other orgs should keep receiving webhooks).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $account = ChatChannelAccount::query()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->findOrFail($id);

        $keepMetaSub = $request->boolean('keep_meta_sub');

        $this->service->disconnectPage($account, unsubscribeMeta: !$keepMetaSub);

        return response()->json(['status' => 'disconnected', 'id' => $id]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private function serialize(ChatChannelAccount $a): array
    {
        return [
            'id'                  => $a->id,
            'channel'             => $a->channel,
            'external_id'         => $a->external_id,
            'display_name'        => $a->display_name,
            'display_avatar_url'  => $a->display_avatar_url,
            'status'              => $a->status,
            'brand_id'            => $a->brand_id,
            'token_verified_at'   => $a->token_verified_at?->toIso8601String(),
            'last_webhook_at'     => $a->last_webhook_at?->toIso8601String(),
            'last_error'          => $a->last_error,
            'connected_by_user_id' => $a->connected_by_user_id,
            'created_at'          => $a->created_at?->toIso8601String(),
            'updated_at'          => $a->updated_at?->toIso8601String(),
        ];
    }
}
