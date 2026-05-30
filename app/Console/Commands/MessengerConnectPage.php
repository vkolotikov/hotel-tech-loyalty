<?php

namespace App\Console\Commands;

use App\Models\Brand;
use App\Models\ChatChannelAccount;
use App\Models\Organization;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Http;

/**
 * Manually connect a Facebook Page to a brand for Messenger integration.
 *
 * This is a Phase 1 BRIDGE — Phase 3 will ship a proper admin UI that
 * does the same thing through Facebook Login. Until then, this lets
 * us / the platform owner validate the receive path end-to-end by
 * connecting a test Page from the CLI.
 *
 * What it does:
 *   1. Validates the Page access token by hitting GET /me on the Graph API.
 *   2. Fetches the Page's display name + avatar URL for the admin UI.
 *   3. Upserts a chat_channel_accounts row (encrypted token via the model's
 *      `saving` hook).
 *   4. POSTs to /<PAGE_ID>/subscribed_apps to subscribe THIS app to webhook
 *      events on the Page (messages, messaging_postbacks, message_deliveries,
 *      message_reads).
 *
 * Usage:
 *   php artisan messenger:connect-page \
 *     --org=1 \
 *     --brand=1 \
 *     --page-id=1234567890 \
 *     --page-token=EAAB...
 *
 * After running, send a Messenger message to the Page from another account.
 * It should land in /engagement within ~1 second.
 *
 * @see apps/loyalty/MESSENGER_INTEGRATION.md
 */
class MessengerConnectPage extends Command
{
    protected $signature = 'messenger:connect-page
        {--org= : Organization id (default: first org)}
        {--brand= : Brand id (default: first brand in the org)}
        {--page-id= : The Facebook Page ID to connect (required)}
        {--page-token= : The Page Access Token from Graph API Explorer (required)}
        {--user= : User id to record as connected_by (default: first staff user in the org)}';

    protected $description = 'Manually connect a Facebook Page for Messenger (Phase 3 bridge — CLI alternative to the admin Connect UI)';

    public function handle(): int
    {
        $pageId    = (string) $this->option('page-id');
        $pageToken = (string) $this->option('page-token');

        if ($pageId === '' || $pageToken === '') {
            $this->error('Both --page-id and --page-token are required.');
            $this->line('Get your token from https://developers.facebook.com/tools/explorer/ — pick your app, select "Page Access Token", grant pages_messaging + pages_manage_metadata + pages_show_list.');
            return self::INVALID;
        }

        // Resolve org.
        $orgId = $this->option('org') !== null ? (int) $this->option('org') : null;
        $org = $orgId !== null
            ? Organization::query()->withoutGlobalScopes()->find($orgId)
            : Organization::query()->withoutGlobalScopes()->orderBy('id')->first();
        if ($org === null) {
            $this->error('No organization found' . ($orgId !== null ? " for id={$orgId}." : '.'));
            return self::FAILURE;
        }

        // Resolve brand within that org.
        $brandId = $this->option('brand') !== null ? (int) $this->option('brand') : null;
        $brand = $brandId !== null
            ? Brand::query()->withoutGlobalScopes()->where('organization_id', $org->id)->find($brandId)
            : Brand::query()->withoutGlobalScopes()->where('organization_id', $org->id)->orderBy('id')->first();
        if ($brand === null) {
            $this->error("No brand found in organization id={$org->id}.");
            return self::FAILURE;
        }

        // Resolve user (optional — used for the audit trail of who connected).
        $userId = $this->option('user') !== null ? (int) $this->option('user') : null;

        $this->info("Connecting Page {$pageId} to brand '{$brand->name}' in org '{$org->name}'...");

        $graphBase = rtrim(config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $graphVer  = config('services.meta.graph_version', 'v25.0');

        // Skip profile fetch — Meta tightened it to require pages_read_engagement
        // permission, which we don't need otherwise (more permissions = more App
        // Review). Page ID is fine as a placeholder display name; the Phase 3
        // admin UI will let admins rename connections.
        //
        // Best-effort token sanity check via /me. With a Page Access Token,
        // /me returns the Page object — works without extra permissions in most
        // cases, but if Meta has tightened this too, we tolerate failure and
        // let the subscribe step (below) do the real validation.
        $this->line('  → Sanity-checking token...');
        $meResp = Http::timeout(10)
            ->withQueryParameters(['fields' => 'id', 'access_token' => $pageToken])
            ->acceptJson()
            ->get("{$graphBase}/{$graphVer}/me");

        if ($meResp->successful()) {
            $tokenPageId = (string) $meResp->json('id');
            if ($tokenPageId !== '' && $tokenPageId !== $pageId) {
                $this->error("    Token is for Page {$tokenPageId}, not {$pageId}. Re-generate a token for the right Page.");
                return self::FAILURE;
            }
            $this->line('    OK');
        } else {
            // Don't bail — the real auth check is the subscribe call below.
            $this->line('    (skipped — subscribe call will validate instead)');
        }

        // Display name placeholder. The Phase 3 admin UI lets admins rename
        // any connection, and the Phase 2 message-receive path doesn't depend
        // on this field for anything.
        $displayName = "Page {$pageId}";
        $avatarUrl   = null;

        // Save the channel account record.
        $this->line('  → Saving connection record...');
        /** @var ChatChannelAccount&Model $account */
        $account = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->where('external_id', $pageId)
            ->first();

        $isUpdate = $account !== null;
        if ($isUpdate) {
            $account->forceFill([
                'brand_id'             => $brand->id,
                // Don't overwrite a display name an admin may have edited.
                'display_name'         => $account->display_name ?: $displayName,
                'display_avatar_url'   => $account->display_avatar_url ?: $avatarUrl,
                'page_access_token'    => $pageToken, // re-encrypted by saving hook
                'status'               => ChatChannelAccount::STATUS_ACTIVE,
                'token_verified_at'    => now(),
                'last_error'           => null,
            ])->save();
        } else {
            $account = ChatChannelAccount::create([
                'organization_id'      => $org->id,
                'brand_id'             => $brand->id,
                'channel'              => ChatChannelAccount::CHANNEL_MESSENGER,
                'external_id'          => $pageId,
                'display_name'         => $displayName,
                'display_avatar_url'   => $avatarUrl,
                'page_access_token'    => $pageToken,
                'status'               => ChatChannelAccount::STATUS_ACTIVE,
                'token_verified_at'    => now(),
                'connected_by_user_id' => $userId,
            ]);
        }
        $this->line("    OK: {$account->id} (" . ($isUpdate ? 'updated' : 'created') . ')');

        // Step 3: subscribe THIS app to webhooks on the Page.
        // This is the "attach Page to webhook" step Meta requires — distinct
        // from configuring the webhook URL in the dashboard, which only
        // tells Meta WHERE to send. This tells them WHICH Page to send for.
        $this->line('  → Subscribing app to Page webhooks...');
        $fields = 'messages,messaging_postbacks,message_deliveries,message_reads';
        $subResp = Http::timeout(10)
            ->withQueryParameters([
                'subscribed_fields' => $fields,
                'access_token'      => $pageToken,
            ])
            ->post("{$graphBase}/{$graphVer}/{$pageId}/subscribed_apps");

        if (!$subResp->successful()) {
            $err = $subResp->json('error.message') ?? "HTTP {$subResp->status()}";
            $account->markError("Subscribe failed: {$err}");
            $this->error("    Failed: {$err}");
            $this->line('    The connection row is saved, but webhooks are NOT live. Common cause: pages_manage_metadata not granted on the token.');
            return self::FAILURE;
        }
        $this->line("    OK: subscribed to {$fields}");

        $this->newLine();
        $this->info("Page '{$displayName}' is connected and live.");
        $this->line('  Send a Messenger DM to the Page from another FB account.');
        $this->line('  It should appear in /engagement within ~1 second.');
        $this->line("  If nothing arrives, check Nightwatch + Laravel logs for 'messenger.webhook.*' entries.");

        return self::SUCCESS;
    }
}
