<?php

namespace App\Services\Channels;

use App\Models\Brand;
use App\Models\ChatChannelAccount;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * MessengerOnboardingService — the user-facing "connect a Page" flow
 * that lives behind the Settings → Integrations UI.
 *
 * Distinct from MessengerDispatcher (which handles message I/O) and
 * the CLI `messenger:connect-page` bridge command (which exists only
 * because Phase 3 hadn't shipped yet). This service is the canonical
 * onboarding path going forward.
 *
 * The end-to-end happy path the React panel walks through:
 *
 *   1. Browser loads FB JS SDK with our META_APP_ID.
 *   2. User clicks "Connect Facebook Page" → FB.login() popup grants
 *      pages_show_list + pages_messaging + pages_manage_metadata.
 *   3. Browser POSTs the short-lived user token to /list-pages.
 *   4. Backend (here):
 *        a. Exchanges short-lived → long-lived user token
 *        b. Hits /me/accounts to fetch the user's manageable Pages
 *        c. Returns { id, name, picture, access_token } per Page
 *      The access_token in each Page entry is ALREADY a Page Access
 *      Token derived from the long-lived user token; Meta's docs say
 *      it's effectively non-expiring as long as the user keeps the
 *      app permission.
 *   5. User picks a Page → browser POSTs page_id + page_token to
 *      /connect.
 *   6. Backend (here):
 *        a. Token sanity check via /me (best-effort — Meta tightened
 *           profile-field requirements over time; failure isn't fatal)
 *        b. Upsert ChatChannelAccount for (org, channel, external_id)
 *        c. POST to /<page_id>/subscribed_apps with our 4 fields
 *        d. Return the saved row
 *
 * Cross-tenant rule: the controller binds the current admin user's
 * org/brand, the service doesn't reach across orgs. ChatChannelAccount
 * has a UNIQUE (org_id, channel, external_id) so re-connecting the
 * same Page for the same org updates the existing row; a different
 * org connecting the same Page is allowed (multi-tenant: hotel chains).
 */
class MessengerOnboardingService
{
    /**
     * Exchange a short-lived user access token (from FB.login) for a
     * long-lived one (~60 days). Page access tokens derived from the
     * long-lived token are effectively non-expiring.
     *
     * Endpoint: GET /oauth/access_token?grant_type=fb_exchange_token
     *           &client_id=APP_ID&client_secret=APP_SECRET
     *           &fb_exchange_token=SHORT_LIVED
     *
     * After exchange, immediately hits /debug_token to introspect what
     * scopes Meta actually granted (FBLB only honours scopes the admin
     * approved in the asset-sharing dialog — the requested-vs-granted
     * gap is what makes "I granted everything and still see no Pages"
     * so confusing). Returns a structured payload instead of a bare
     * string so callers can persist scopes + expiry on the connection
     * for later health checks.
     *
     * @return array{token:string, scopes:array, granular_scopes:array, expires_at:?int, data_access_expires_at:?int, is_valid:bool}
     * @throws RuntimeException on failure
     */
    public function exchangeUserToken(string $shortLivedToken): array
    {
        $appId     = (string) config('services.meta.app_id', '');
        $appSecret = (string) config('services.meta.app_secret', '');
        if ($appId === '' || $appSecret === '') {
            throw new RuntimeException('Meta app credentials not configured');
        }

        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        $resp = Http::timeout(15)
            ->withQueryParameters([
                'grant_type'        => 'fb_exchange_token',
                'client_id'         => $appId,
                'client_secret'     => $appSecret,
                'fb_exchange_token' => $shortLivedToken,
            ])
            ->acceptJson()
            ->get("{$base}/{$ver}/oauth/access_token");

        $this->ensureSuccessful($resp, 'Long-lived token exchange failed');

        $longLived = (string) ($resp->json('access_token') ?? '');
        if ($longLived === '') {
            throw new RuntimeException('Meta returned no access_token from exchange');
        }

        // Introspect the brand-new long-lived token. Best-effort — if
        // /debug_token errors, we still return a usable token (just
        // without scope context). Granular scopes' target_ids array is
        // the single most useful diagnostic for FBLB onboarding: it
        // tells us WHICH Pages the admin actually shared.
        $debug = $this->debugToken($longLived);

        Log::info('messenger.onboarding.exchange.debug_token', [
            'is_valid'             => $debug['is_valid'] ?? null,
            'scopes'               => $debug['scopes'] ?? [],
            'granular_scopes'      => $debug['granular_scopes'] ?? [],
            'expires_at'           => $debug['expires_at'] ?? null,
            'data_access_expires_at' => $debug['data_access_expires_at'] ?? null,
        ]);

        return [
            'token'                  => $longLived,
            'scopes'                 => $debug['scopes'] ?? [],
            'granular_scopes'        => $debug['granular_scopes'] ?? [],
            'expires_at'             => $debug['expires_at'] ?? null,
            'data_access_expires_at' => $debug['data_access_expires_at'] ?? null,
            'is_valid'               => $debug['is_valid'] ?? true,
        ];
    }

    /**
     * Introspect any user or page token via Meta's /debug_token endpoint.
     * Uses the app-token form (`app_id|app_secret`) so we can call this
     * without holding another user token.
     *
     * Returns a normalised shape — Meta's raw response nests data under
     * `data` and the keys are inconsistent (some endpoints return camelCase,
     * /debug_token uses snake_case). We flatten + default to make caller
     * code straightforward.
     *
     * @return array{scopes:array, granular_scopes:array, expires_at:?int, data_access_expires_at:?int, is_valid:bool, app_id:?string, user_id:?string}
     */
    private function debugToken(string $token): array
    {
        $appId     = (string) config('services.meta.app_id', '');
        $appSecret = (string) config('services.meta.app_secret', '');
        $base      = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver       = (string) config('services.meta.graph_version', 'v25.0');

        if ($appId === '' || $appSecret === '' || $token === '') {
            return [
                'scopes'                 => [],
                'granular_scopes'        => [],
                'expires_at'             => null,
                'data_access_expires_at' => null,
                'is_valid'               => false,
                'app_id'                 => null,
                'user_id'                => null,
            ];
        }

        try {
            $resp = Http::timeout(10)
                ->withQueryParameters([
                    'input_token'  => $token,
                    'access_token' => "{$appId}|{$appSecret}",
                ])
                ->acceptJson()
                ->get("{$base}/{$ver}/debug_token");

            if (! $resp->successful()) {
                Log::warning('messenger.onboarding.debug_token.failed', [
                    'status' => $resp->status(),
                    'body'   => $resp->json('error') ?? $resp->body(),
                ]);
                return [
                    'scopes'                 => [],
                    'granular_scopes'        => [],
                    'expires_at'             => null,
                    'data_access_expires_at' => null,
                    'is_valid'               => false,
                    'app_id'                 => null,
                    'user_id'                => null,
                ];
            }

            $data = (array) ($resp->json('data') ?? []);
            return [
                'scopes'                 => (array) ($data['scopes'] ?? []),
                'granular_scopes'        => (array) ($data['granular_scopes'] ?? []),
                'expires_at'             => isset($data['expires_at']) ? (int) $data['expires_at'] : null,
                'data_access_expires_at' => isset($data['data_access_expires_at']) ? (int) $data['data_access_expires_at'] : null,
                'is_valid'               => (bool) ($data['is_valid'] ?? false),
                'app_id'                 => isset($data['app_id']) ? (string) $data['app_id'] : null,
                'user_id'                => isset($data['user_id']) ? (string) $data['user_id'] : null,
            ];
        } catch (\Throwable $e) {
            Log::warning('messenger.onboarding.debug_token.exception', [
                'message' => $e->getMessage(),
            ]);
            return [
                'scopes'                 => [],
                'granular_scopes'        => [],
                'expires_at'             => null,
                'data_access_expires_at' => null,
                'is_valid'               => false,
                'app_id'                 => null,
                'user_id'                => null,
            ];
        }
    }

    /**
     * Fetch every Page the user can manage with the given user access
     * token. Each entry includes a Page Access Token we can store
     * directly — the Page tokens returned here inherit the long-lived
     * lifetime of the user token they were derived from.
     *
     * Three-pronged fetch (lessons learned from FBLB asset sharing):
     *
     *   A. GET /me/accounts — Pages the user personally administers.
     *      This is the classic Facebook Login flow's only source.
     *   B. GET /me/businesses — Business Manager IDs the user is part of.
     *   C. For each business:
     *      - GET /{biz_id}/owned_pages — Pages the business owns
     *      - GET /{biz_id}/client_pages — Pages the business manages on
     *        behalf of clients (the "asset-sharing" flow)
     *
     * Under FBLB an admin can share their employer's Page WITHOUT
     * actually being an admin of the Page — the Business owns it and
     * grants the partner business access. Those Pages don't appear under
     * /me/accounts at all, only via the business endpoints. Skipping
     * Step C is why the customer sees an empty list after granting
     * scopes.
     *
     * Filter strategy: `tasks` is unreliable across the three sources.
     *   - If `tasks` is populated AND doesn't include MESSAGING/MANAGE,
     *     reject (clearly wrong scope grant).
     *   - If `tasks` is absent/empty, accept (FBLB asset-share rows
     *     often omit it). The subsequent Send API call gates on real
     *     permission, so we don't lose safety.
     *
     * Page must have an access_token to be useful. Merging strategy:
     * dedupe by Page ID, prefer the row with a non-empty access_token —
     * /me/businesses' nested endpoints sometimes return Pages without
     * a token (when the user can SEE the asset but isn't authorised to
     * message as it), which would be useless to us.
     *
     * @return array<int, array{id:string,name:string,picture_url:?string,access_token:string}>
     */
    public function listManageablePages(string $userToken): array
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        // ─── Step A: /me/accounts ───────────────────────────────────
        $accountsRows = $this->fetchPageList(
            "{$base}/{$ver}/me/accounts",
            $userToken,
            'id,name,picture.type(large),access_token,tasks',
            'me_accounts',
        );

        // ─── Step B: /me/businesses ─────────────────────────────────
        $businesses = $this->fetchBusinesses($userToken);

        // ─── Step C: per-business owned + client pages ──────────────
        $ownedBizRows = [];
        $clientBizRows = [];
        foreach ($businesses as $biz) {
            $bizId = (string) ($biz['id'] ?? '');
            if ($bizId === '') continue;

            $ownedBizRows = array_merge($ownedBizRows, $this->fetchPageList(
                "{$base}/{$ver}/{$bizId}/owned_pages",
                $userToken,
                'id,name,picture.type(large),access_token,tasks',
                "biz:{$bizId}:owned",
            ));

            $clientBizRows = array_merge($clientBizRows, $this->fetchPageList(
                "{$base}/{$ver}/{$bizId}/client_pages",
                $userToken,
                'id,name,picture.type(large),access_token,tasks',
                "biz:{$bizId}:client",
            ));
        }

        // Merge + dedupe by page id. Prefer rows with a non-empty
        // access_token; if multiple have a token, last-write-wins which
        // is fine since they're all equivalent Page Access Tokens.
        $byId = [];
        $allRows = array_merge($accountsRows, $ownedBizRows, $clientBizRows);
        foreach ($allRows as $row) {
            $pid = (string) ($row['id'] ?? '');
            if ($pid === '') continue;
            $existing = $byId[$pid] ?? null;
            // Prefer the row that actually has a token.
            if ($existing === null) {
                $byId[$pid] = $row;
                continue;
            }
            $existingHasToken = !empty($existing['access_token']);
            $candidateHasToken = !empty($row['access_token']);
            if ($candidateHasToken && !$existingHasToken) {
                $byId[$pid] = $row;
            }
        }

        Log::info('messenger.onboarding.list_pages.raw_counts', [
            'me_accounts'          => count($accountsRows),
            'businesses'           => count($businesses),
            'owned_biz_pages'      => count($ownedBizRows),
            'client_biz_pages'     => count($clientBizRows),
            'final_unique_pre_filter' => count($byId),
        ]);

        $pages = [];
        foreach ($byId as $row) {
            $tokenStr = (string) ($row['access_token'] ?? '');
            if ($tokenStr === '') continue; // hard filter — no token = can't do anything

            $tasks = $row['tasks'] ?? null;
            // Only reject when tasks IS present AND lacks the right capability.
            // FBLB asset-sharing often omits tasks entirely; treat that as
            // "trust the grant, let Send API gate on actual permission".
            if (is_array($tasks) && !empty($tasks)
                && !in_array('MESSAGING', $tasks, true)
                && !in_array('MANAGE', $tasks, true)
            ) {
                continue;
            }

            $pages[] = [
                'id'           => (string) ($row['id'] ?? ''),
                'name'         => (string) ($row['name'] ?? ''),
                'picture_url'  => $row['picture']['data']['url'] ?? null,
                'access_token' => $tokenStr,
            ];
        }

        Log::info('messenger.onboarding.list_pages.filtered', [
            'returned' => count($pages),
            'page_ids' => array_column($pages, 'id'),
        ]);

        return $pages;
    }

    /**
     * Fetch a single page-list endpoint with consistent error handling
     * + diagnostic logging. Returns [] on non-2xx (FBLB calls can 400
     * if a particular business doesn't grant the right scope; that's
     * NOT fatal — other businesses might still yield pages).
     *
     * @return array<int, array<string, mixed>>
     */
    private function fetchPageList(string $url, string $userToken, string $fields, string $sourceLabel): array
    {
        try {
            $resp = Http::timeout(15)
                ->withQueryParameters([
                    'fields'       => $fields,
                    'access_token' => $userToken,
                    'limit'        => 100,
                ])
                ->acceptJson()
                ->get($url);

            if (! $resp->successful()) {
                Log::info('messenger.onboarding.list_pages.source_failed', [
                    'source' => $sourceLabel,
                    'status' => $resp->status(),
                    'error'  => $resp->json('error.message') ?? null,
                ]);
                return [];
            }

            return (array) ($resp->json('data') ?? []);
        } catch (\Throwable $e) {
            Log::info('messenger.onboarding.list_pages.source_exception', [
                'source'  => $sourceLabel,
                'message' => $e->getMessage(),
            ]);
            return [];
        }
    }

    /**
     * Fetch the list of Business Manager accounts the user belongs to.
     * Best-effort: returns [] on failure (the user might have granted
     * pages_show_list but not business_management).
     *
     * @return array<int, array{id:string, name?:string}>
     */
    private function fetchBusinesses(string $userToken): array
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        try {
            $resp = Http::timeout(15)
                ->withQueryParameters([
                    'fields'       => 'id,name',
                    'access_token' => $userToken,
                    'limit'        => 100,
                ])
                ->acceptJson()
                ->get("{$base}/{$ver}/me/businesses");

            if (! $resp->successful()) {
                Log::info('messenger.onboarding.list_businesses.failed', [
                    'status' => $resp->status(),
                    'error'  => $resp->json('error.message') ?? null,
                ]);
                return [];
            }

            return (array) ($resp->json('data') ?? []);
        } catch (\Throwable $e) {
            Log::info('messenger.onboarding.list_businesses.exception', [
                'message' => $e->getMessage(),
            ]);
            return [];
        }
    }

    /**
     * Connect a Page to a brand. Idempotent: re-running for the same
     * (org, page_id) updates the existing row instead of erroring on
     * the UNIQUE constraint, so a customer can recover from a stale
     * token without us doing anything fancy.
     *
     * Performs the two side-effects Meta requires:
     *   - Stores the Page Access Token (encrypted at rest via the model)
     *   - POSTs /subscribed_apps to attach our app to the Page's webhook
     *
     * @throws RuntimeException if Meta refuses the subscribe call
     */
    public function connectPage(
        Organization $org,
        ?Brand $brand,
        ?User $user,
        string $pageId,
        string $pageToken,
        ?string $displayName = null,
        ?string $avatarUrl = null,
    ): ChatChannelAccount {
        $account = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->where('external_id', $pageId)
            ->first();

        // Introspect the Page Access Token so we can record what it
        // actually grants. The page-token scopes are typically a subset
        // of the user-token scopes (Meta strips anything that's not
        // applicable to a Page). Stash them so checkTokenHealth() can
        // later distinguish "expired" vs "scopes-revoked" vs
        // "scopes-stripped-by-meta".
        $pageDebug = $this->debugToken($pageToken);
        Log::info('messenger.onboarding.connect.page_token_debug', [
            'page_id'                => $pageId,
            'is_valid'               => $pageDebug['is_valid'] ?? null,
            'scopes'                 => $pageDebug['scopes'] ?? [],
            'expires_at'             => $pageDebug['expires_at'] ?? null,
            'data_access_expires_at' => $pageDebug['data_access_expires_at'] ?? null,
        ]);

        $payload = [
            'brand_id'              => $brand?->id,
            'display_name'          => $displayName ?: ($account?->display_name ?: "Page {$pageId}"),
            'display_avatar_url'    => $avatarUrl ?: $account?->display_avatar_url,
            'page_access_token'     => $pageToken,
            'status'                => ChatChannelAccount::STATUS_ACTIVE,
            'token_verified_at'     => now(),
            'last_error'            => null,
            'token_scopes'          => $pageDebug['scopes'] ?? [],
            'token_expires_at'      => isset($pageDebug['expires_at']) && $pageDebug['expires_at'] > 0
                ? \Carbon\Carbon::createFromTimestamp($pageDebug['expires_at'])
                : null,
            'data_access_expires_at' => isset($pageDebug['data_access_expires_at']) && $pageDebug['data_access_expires_at'] > 0
                ? \Carbon\Carbon::createFromTimestamp($pageDebug['data_access_expires_at'])
                : null,
        ];

        if ($account !== null) {
            $account->forceFill($payload)->save();
        } else {
            $account = ChatChannelAccount::create(array_merge($payload, [
                'organization_id'      => $org->id,
                'channel'              => ChatChannelAccount::CHANNEL_MESSENGER,
                'external_id'          => $pageId,
                'connected_by_user_id' => $user?->id,
            ]));
        }

        // Subscribe THIS app to webhooks on the Page. Failure here means
        // the row is saved but webhooks won't fire — record the error
        // for the UI to surface, but DON'T throw out the connection
        // (the customer can retry the subscribe action separately).
        try {
            $this->subscribePageWebhooks($account);
        } catch (RuntimeException $e) {
            $account->markError("Webhook subscribe failed: {$e->getMessage()}");
            throw $e;
        }

        $account->refresh();
        return $account;
    }

    /**
     * POST /<PAGE_ID>/subscribed_apps with our 4 fields. Idempotent on
     * Meta's side — re-subscribing returns success silently.
     */
    public function subscribePageWebhooks(ChatChannelAccount $account): bool
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        $fields = 'messages,messaging_postbacks,message_deliveries,message_reads';

        $resp = Http::timeout(15)
            ->withQueryParameters([
                'subscribed_fields' => $fields,
                'access_token'      => $account->page_access_token,
            ])
            ->post("{$base}/{$ver}/{$account->external_id}/subscribed_apps");

        $this->ensureSuccessful($resp, 'Subscribe-to-webhooks failed');
        return true;
    }

    /**
     * Disconnect: remove our DB row and (when this is the last row for
     * the Page) call Meta's DELETE /subscribed_apps so we stop
     * receiving webhooks for that Page. Same smart cross-row logic as
     * the messenger:disconnect-page CLI command.
     */
    public function disconnectPage(ChatChannelAccount $account, bool $unsubscribeMeta = true): void
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        $otherCount = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->where('channel', $account->channel)
            ->where('external_id', $account->external_id)
            ->where('id', '!=', $account->id)
            ->count();

        if ($unsubscribeMeta && $otherCount === 0 && !empty($account->getAttributes()['page_access_token'])) {
            // Best-effort — local delete proceeds regardless of Meta result.
            Http::timeout(10)
                ->withQueryParameters(['access_token' => $account->page_access_token])
                ->delete("{$base}/{$ver}/{$account->external_id}/subscribed_apps");
        }

        $account->delete();
    }

    /**
     * Health-check a stored token by hitting GET /me. Used by the UI's
     * status badge + the future daily cron that flips rows to
     * `reauth_required` when their token has died.
     *
     * Uses stored scopes + expiry from `connectPage()` to distinguish:
     *   - 'expired'        — token_expires_at is in the past
     *   - 'scope_missing'  — required messaging scope not in stored scopes
     *   - 'revoked'        — Meta returns an error (e.g. user removed app)
     *   - 'active'         — /me succeeds
     *
     * The distinction matters in the UI: an expired token can be cured
     * by a silent refresh path, a revoked token needs the customer to
     * re-run Facebook Login, and a scope_missing row needs the customer
     * to re-share assets with the right permissions checked.
     */
    public function checkTokenHealth(ChatChannelAccount $account): bool
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        if (empty($account->getAttributes()['page_access_token'])) {
            $account->forceFill([
                'status'     => ChatChannelAccount::STATUS_REAUTH,
                'last_error' => 'Token health: no token stored',
            ])->save();
            return false;
        }

        // Local check 1: token_expires_at is past → 'expired'.
        if ($account->token_expires_at !== null && $account->token_expires_at->isPast()) {
            $account->forceFill([
                'status'     => ChatChannelAccount::STATUS_REAUTH,
                'last_error' => "Token health: expired at {$account->token_expires_at->toIso8601String()}",
            ])->save();
            return false;
        }

        // Local check 2: required messaging scope absent from stored
        // scopes → 'scope_missing'. We require pages_messaging at minimum.
        $stored = (array) ($account->token_scopes ?? []);
        if (!empty($stored)) {
            $required = ['pages_messaging'];
            $missing = array_values(array_diff($required, $stored));
            if (!empty($missing)) {
                $account->forceFill([
                    'status'     => ChatChannelAccount::STATUS_REAUTH,
                    'last_error' => 'Token health: scope_missing — ' . implode(', ', $missing),
                ])->save();
                return false;
            }
        }

        // Remote check: use /debug_token instead of /me.
        //
        // History: an earlier ship used GET /me?fields=id with the page
        // token. Meta tightened the /me endpoint to require
        // pages_read_engagement — even for the trivial "what's my id"
        // call. Tokens minted via FBLB with only pages_messaging +
        // pages_manage_metadata (the scopes actually needed to receive
        // and reply to DMs) started failing the health check with
        //   (#100) Object does not exist, cannot be loaded due to
        //   missing permission... requires 'pages_read_engagement'
        // even though the token works fine for the live messaging path.
        // This mis-flagged healthy tokens as 'error' and confused
        // operators clicking Diagnose.
        //
        // /debug_token uses the App Access Token (app_id|app_secret) to
        // introspect ANY token — no page-side permissions required. It
        // returns is_valid (the canonical health signal) plus scopes,
        // expiry, and granular grants. This is the documented way to
        // verify a Page Access Token per Meta's own debugging guidance.
        $debug = $this->debugToken($account->page_access_token);

        if ($debug['is_valid']) {
            // Opportunistically refresh stored scopes + expiry — they
            // can change between connects (e.g. user revoked a scope
            // via FB Account Center).
            $payload = [
                'status'            => ChatChannelAccount::STATUS_ACTIVE,
                'token_verified_at' => now(),
                'last_error'        => null,
            ];
            if (!empty($debug['scopes'])) {
                $payload['token_scopes'] = $debug['scopes'];
            }
            if ($debug['expires_at'] !== null && $debug['expires_at'] > 0) {
                $payload['token_expires_at'] = \Carbon\Carbon::createFromTimestamp($debug['expires_at']);
            }
            if ($debug['data_access_expires_at'] !== null && $debug['data_access_expires_at'] > 0) {
                $payload['data_access_expires_at'] = \Carbon\Carbon::createFromTimestamp($debug['data_access_expires_at']);
            }
            $account->forceFill($payload)->saveQuietly();
            return true;
        }

        // debug_token returned is_valid=false → token genuinely dead
        // (revoked / expired / wrong app). Distinct from the old /me
        // path which conflated permission errors with token death.
        $account->forceFill([
            'status'     => ChatChannelAccount::STATUS_REAUTH,
            'last_error' => 'Token health: revoked or expired — re-run the Facebook Login flow to mint a new Page Access Token.',
        ])->save();
        return false;
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private function ensureSuccessful(Response $resp, string $contextLabel): void
    {
        if ($resp->successful()) return;
        $msg = (string) ($resp->json('error.message') ?? "HTTP {$resp->status()}");
        throw new RuntimeException("{$contextLabel}: {$msg}");
    }
}
