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
     * @throws RuntimeException on failure
     */
    public function exchangeUserToken(string $shortLivedToken): string
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
        return $longLived;
    }

    /**
     * Fetch every Page the user can manage with the given user access
     * token. Each entry includes a Page Access Token we can store
     * directly — the Page tokens returned here inherit the long-lived
     * lifetime of the user token they were derived from.
     *
     * Endpoint: GET /me/accounts?fields=id,name,picture,access_token,tasks
     *
     * Filter strategy (lessons learned): Facebook Login for Business
     * asset sharing returns `tasks` inconsistently — sometimes absent,
     * sometimes empty array, sometimes populated. The original strict
     * filter ("tasks must include MESSAGING or MANAGE") rejected every
     * page when tasks was absent. New strategy:
     *
     *   - If `tasks` is populated AND doesn't include MESSAGING/MANAGE,
     *     reject (clearly wrong scope grant).
     *   - If `tasks` is absent/empty, accept (FBLB flow that didn't
     *     surface the field). The subsequent Send API call will
     *     return a clear permission error if the page really can't
     *     be messaged, so we don't lose any safety.
     *
     * Page must have an access_token to be useful — that's the hard
     * filter that excludes garbage entries.
     *
     * @return array<int, array{id:string,name:string,picture_url:?string,access_token:string}>
     */
    public function listManageablePages(string $userToken): array
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        $resp = Http::timeout(15)
            ->withQueryParameters([
                'fields'       => 'id,name,picture.type(large),access_token,tasks',
                'access_token' => $userToken,
                'limit'        => 100,
            ])
            ->acceptJson()
            ->get("{$base}/{$ver}/me/accounts");

        $this->ensureSuccessful($resp, 'Listing Pages failed');

        $rows = (array) ($resp->json('data') ?? []);

        // Log what Meta returned for diagnostic purposes. Page IDs +
        // tasks shape only — not the access_tokens (don't log secrets).
        Log::info('messenger.onboarding.list_pages.meta_response', [
            'count'   => count($rows),
            'sample'  => array_map(fn ($r) => [
                'id'    => $r['id'] ?? null,
                'name'  => $r['name'] ?? null,
                'tasks' => $r['tasks'] ?? null,
                'has_token' => !empty($r['access_token']),
            ], array_slice($rows, 0, 10)),
        ]);

        $pages = [];
        foreach ($rows as $row) {
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

        $payload = [
            'brand_id'           => $brand?->id,
            'display_name'       => $displayName ?: ($account?->display_name ?: "Page {$pageId}"),
            'display_avatar_url' => $avatarUrl ?: $account?->display_avatar_url,
            'page_access_token'  => $pageToken,
            'status'             => ChatChannelAccount::STATUS_ACTIVE,
            'token_verified_at'  => now(),
            'last_error'         => null,
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
     */
    public function checkTokenHealth(ChatChannelAccount $account): bool
    {
        $base = rtrim((string) config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $ver  = (string) config('services.meta.graph_version', 'v25.0');

        if (empty($account->getAttributes()['page_access_token'])) {
            return false;
        }

        $resp = Http::timeout(8)
            ->withQueryParameters([
                'fields'       => 'id',
                'access_token' => $account->page_access_token,
            ])
            ->get("{$base}/{$ver}/me");

        if ($resp->successful()) {
            $account->forceFill([
                'status'            => ChatChannelAccount::STATUS_ACTIVE,
                'token_verified_at' => now(),
                'last_error'        => null,
            ])->saveQuietly();
            return true;
        }

        $err = $resp->json('error.message') ?? "HTTP {$resp->status()}";
        $account->forceFill([
            'status'     => ChatChannelAccount::STATUS_REAUTH,
            'last_error' => "Token health check failed: {$err}",
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
