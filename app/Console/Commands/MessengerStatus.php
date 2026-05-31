<?php

namespace App\Console\Commands;

use App\Models\ChatChannelAccount;
use App\Models\ChatMessage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * messenger:status — diagnostic readout for all connected Messenger Pages.
 *
 * For each chat_channel_accounts row with channel='messenger', this command:
 *   1. Prints the local view (id, org, brand, status, last_webhook_at, last_error)
 *   2. Asks Meta directly: `GET /<PAGE_ID>/subscribed_apps?access_token=<token>`
 *      — returns the apps subscribed to that Page. Tells us authoritatively
 *      whether the dashboard's "Add Subscriptions" actually took effect.
 *   3. Counts inbound messages received for this account (chat_messages
 *      where direction='inbound').
 *
 * Use this whenever the receive path isn't working — answers the
 * "is Meta even forwarding webhooks to us?" question without guesswork.
 *
 * @see apps/loyalty/MESSENGER_INTEGRATION.md
 */
class MessengerStatus extends Command
{
    protected $signature = 'messenger:status {--account= : Specific account id to inspect (default: all messenger accounts)}';

    protected $description = 'Inspect connected Messenger Pages — local row + Meta-side subscription state + inbound message count';

    public function handle(): int
    {
        $accountId = $this->option('account') !== null ? (int) $this->option('account') : null;

        $accounts = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->when($accountId !== null, fn ($q) => $q->where('id', $accountId))
            ->orderBy('id')
            ->get();

        if ($accounts->isEmpty()) {
            $this->warn('No Messenger channel accounts found' . ($accountId !== null ? " (id={$accountId})" : '.'));
            return self::SUCCESS;
        }

        $graphBase = rtrim(config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
        $graphVer  = config('services.meta.graph_version', 'v25.0');
        $expectedAppId = (string) config('services.meta.app_id', '');

        $this->newLine();
        $this->info("Found {$accounts->count()} Messenger account(s). Expected app id: " . ($expectedAppId ?: '(unset)'));
        $this->newLine();

        foreach ($accounts as $account) {
            $this->printAccount($account, $graphBase, $graphVer, $expectedAppId);
            $this->newLine();
        }

        return self::SUCCESS;
    }

    private function printAccount(ChatChannelAccount $account, string $graphBase, string $graphVer, string $expectedAppId): void
    {
        $this->line("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        $this->line("Account id: {$account->id}");
        $this->line("  Page ID         : {$account->external_id}");
        $this->line("  Display name    : " . ($account->display_name ?? '—'));
        $this->line("  Org             : {$account->organization_id}");
        $this->line("  Brand           : " . ($account->brand_id ?? '—'));
        $this->line("  Status          : {$account->status}");
        $this->line("  Token verified  : " . ($account->token_verified_at?->toDateTimeString() ?? 'never'));
        $this->line("  Last webhook    : " . ($account->last_webhook_at?->toDateTimeString() ?? 'never'));
        $this->line("  Last error      : " . ($account->last_error ?? 'none'));

        // Local message count.
        $inbound = ChatMessage::query()
            ->withoutGlobalScopes()
            ->whereHas('conversation', fn ($q) => $q->withoutGlobalScopes()
                ->where('channel_account_id', $account->id))
            ->where('direction', ChatMessage::DIRECTION_INBOUND)
            ->count();
        $this->line("  Inbound messages: {$inbound}");

        if (empty($account->getAttributes()['page_access_token'])) {
            $this->error('  → No page_access_token stored; cannot query Meta. Re-run messenger:connect-page.');
            return;
        }

        // Ask Meta directly which apps are subscribed to this Page.
        $url = "{$graphBase}/{$graphVer}/{$account->external_id}/subscribed_apps";
        $resp = Http::timeout(10)
            ->withQueryParameters(['access_token' => $account->page_access_token])
            ->acceptJson()
            ->get($url);

        $this->newLine();
        $this->line('  Meta-side subscription check:');
        if (!$resp->successful()) {
            $err = $resp->json('error.message') ?? "HTTP {$resp->status()}";
            $this->error("    Meta API call failed: {$err}");
            $this->line('    Common cause: page token expired or lacks pages_manage_metadata.');
            return;
        }

        $subscribedApps = $resp->json('data') ?? [];
        if (empty($subscribedApps)) {
            $this->error('    Meta says NO apps are subscribed to this Page.');
            $this->line("    → The 'Add Subscriptions' button in the dashboard didn't take effect, OR the dialog wasn't confirmed.");
            $this->line('    → Fix: open Meta dashboard → Messenger → Generate access tokens →');
            $this->line("       click 'Add Subscriptions' for this Page → check the 4 fields → CLICK CONFIRM.");
            return;
        }

        $matched = false;
        foreach ($subscribedApps as $app) {
            $appId   = (string) ($app['id'] ?? '');
            $appName = (string) ($app['name'] ?? '?');
            $fields  = is_array($app['subscribed_fields'] ?? null)
                ? implode(', ', $app['subscribed_fields'])
                : '(none)';

            $isOurs = $expectedAppId !== '' && $appId === $expectedAppId;
            if ($isOurs) {
                $matched = true;
                $this->info("    ✓ {$appName} (id={$appId}) — fields: {$fields}");
                if (!str_contains($fields, 'messages')) {
                    $this->warn("      ⚠ 'messages' field NOT subscribed. Inbound DMs won't fire.");
                }
            } else {
                $this->line("    · {$appName} (id={$appId}) — fields: {$fields}");
            }
        }

        if (!$matched) {
            $this->error("    Our app (id={$expectedAppId}) is NOT in the subscribed list.");
            $this->line('    → The Page is subscribed to some OTHER app, but not ours.');
            $this->line("    → Fix: in Meta dashboard → Messenger → Generate access tokens →");
            $this->line("       click 'Add Subscriptions' for this Page using YOUR app's dashboard.");
        }
    }
}
