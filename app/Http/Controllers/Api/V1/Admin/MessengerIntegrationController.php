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
