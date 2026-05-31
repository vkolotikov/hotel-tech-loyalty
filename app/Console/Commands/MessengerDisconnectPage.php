<?php

namespace App\Console\Commands;

use App\Models\ChatChannelAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * messenger:disconnect-page — remove a ChatChannelAccount row and
 * (when safe) the Meta-side subscription too.
 *
 * Smart about cross-row sharing: if other rows still reference the
 * same Page (e.g. multiple orgs sharing a Page in some future setup),
 * the Meta-side subscription is left alone so those other rows keep
 * receiving webhooks. Only when this is the LAST row for the Page do
 * we call Meta to unsubscribe.
 *
 * Use --keep-meta-sub to skip the Meta unsubscribe regardless. Useful
 * when:
 *   - Cleaning up a duplicate/orphaned row while keeping the active one
 *     working (the typical "I ran connect-page twice with different
 *     --org and now I have two rows" case)
 *   - Temporary deletion before re-creating the row with different org/brand
 *
 * @see apps/loyalty/MESSENGER_INTEGRATION.md
 */
class MessengerDisconnectPage extends Command
{
    protected $signature = 'messenger:disconnect-page
        {--account= : ChatChannelAccount row id to delete (required)}
        {--keep-meta-sub : Skip the Meta-side unsubscribe call (leave the Page subscribed)}
        {--dry-run : Print what would happen without making changes}';

    protected $description = 'Delete a connected Messenger Page row, optionally unsubscribing from Meta';

    public function handle(): int
    {
        $id = (int) ($this->option('account') ?? 0);
        if ($id <= 0) {
            $this->error('--account=<row id> is required.');
            $this->line('Find the right id with:  php artisan messenger:status');
            return self::INVALID;
        }

        $account = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->find($id);

        if ($account === null) {
            $this->error("No ChatChannelAccount found with id={$id}.");
            return self::FAILURE;
        }

        $this->info("Disconnecting account id={$account->id}");
        $this->line("  Channel    : {$account->channel}");
        $this->line("  Page ID    : {$account->external_id}");
        $this->line("  Org / Brand: {$account->organization_id} / " . ($account->brand_id ?? '—'));

        // How many OTHER rows reference this Page (across all orgs)?
        $otherCount = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->where('channel', $account->channel)
            ->where('external_id', $account->external_id)
            ->where('id', '!=', $account->id)
            ->count();

        $shouldUnsubMeta = $otherCount === 0 && !$this->option('keep-meta-sub');

        if ($otherCount > 0) {
            $this->line("  → {$otherCount} other row(s) still reference this Page — keeping Meta-side subscription alive for them.");
        }

        if ($this->option('dry-run')) {
            $this->newLine();
            $this->warn('Dry run — no changes made.');
            $this->line('  Would delete local row id=' . $account->id);
            if ($shouldUnsubMeta) {
                $this->line('  Would call Meta DELETE /' . $account->external_id . '/subscribed_apps');
            }
            return self::SUCCESS;
        }

        if ($shouldUnsubMeta) {
            $this->line('  → Removing Meta-side subscription...');
            $graphBase = rtrim(config('services.meta.graph_url', 'https://graph.facebook.com'), '/');
            $graphVer  = config('services.meta.graph_version', 'v25.0');
            $token = $account->page_access_token;
            if (empty($token)) {
                $this->warn('    Skipped (no page_access_token stored on this row)');
            } else {
                $resp = Http::timeout(10)
                    ->withQueryParameters(['access_token' => $token])
                    ->delete("{$graphBase}/{$graphVer}/{$account->external_id}/subscribed_apps");
                if ($resp->successful()) {
                    $this->line('    OK');
                } else {
                    $err = $resp->json('error.message') ?? "HTTP {$resp->status()}";
                    // Don't bail — the local delete should still happen.
                    $this->warn("    Failed (continuing): {$err}");
                }
            }
        }

        $account->delete();
        $this->info("  → Deleted local row id={$id}");

        $this->newLine();
        $this->line('Verify with:  php artisan messenger:status');

        return self::SUCCESS;
    }
}
