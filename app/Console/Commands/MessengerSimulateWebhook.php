<?php

namespace App\Console\Commands;

use App\Models\ChatChannelAccount;
use App\Services\Channels\MessengerDispatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * messenger:simulate-webhook — fabricate a production-shape Meta webhook
 * payload and run it through MessengerDispatcher::handleIncoming() to
 * validate the receive path WITHOUT depending on Meta.
 *
 * Why this exists:
 *
 *   1. Meta's "Test" button in the dashboard sends payloads wrapped in
 *      a `{sample: {field, value}}` envelope — NOT the production shape
 *      our webhook handler expects (`{object: "page", entry: [...]}`).
 *      So the Test button proves "Meta can reach our URL" but doesn't
 *      exercise our parsing logic.
 *
 *   2. Real production DMs require App Review + Live mode. Per Meta's
 *      current policy, unpublished apps receive ZERO production webhooks
 *      — not even from App Admins. Validating Phase 1 receive
 *      end-to-end before App Review was impossible without this tool.
 *
 *   3. Permanent ops value: simulating webhook deliveries is useful for
 *      reproducing bugs, smoke-testing the dispatcher after changes,
 *      and writing fixtures for future test suites.
 *
 * What it does:
 *
 *   - Builds a real-shape inbound message payload (sender, recipient,
 *     timestamp, message.mid, message.text)
 *   - Calls MessengerDispatcher::handleIncoming() directly on the
 *     account record — bypassing HTTP + signature verification
 *   - The dispatcher does the real work: conversation upsert, message
 *     persistence, idempotency check, account's last_webhook_at bump
 *   - Reports what was created
 *
 * Usage:
 *
 *   php artisan messenger:simulate-webhook --account=2
 *
 * After running, check /engagement — a conversation with the fake
 * PSID and the simulated text should appear. THAT confirms Phase 1
 * receive is end-to-end working. Real DMs will land the same way
 * once App Review approves the app for production webhook delivery.
 *
 * @see apps/loyalty/MESSENGER_INTEGRATION.md
 */
class MessengerSimulateWebhook extends Command
{
    protected $signature = 'messenger:simulate-webhook
        {--account= : ChatChannelAccount row id to receive the simulated message (required)}
        {--text=hello from simulation : Message text content}
        {--psid= : Fake sender PSID (default: random "sim_..." string)}';

    protected $description = 'Simulate an inbound Messenger webhook by running a fabricated payload through MessengerDispatcher directly (bypasses Meta, useful pre-App-Review)';

    public function __construct(private readonly MessengerDispatcher $dispatcher)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $accountId = (int) ($this->option('account') ?? 0);
        if ($accountId <= 0) {
            $this->error('--account=N is required.');
            $this->line('Find your account id with:  php artisan messenger:status');
            return self::INVALID;
        }

        $account = ChatChannelAccount::query()
            ->withoutGlobalScopes()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->find($accountId);

        if ($account === null) {
            $this->error("No Messenger account found with id={$accountId}.");
            return self::FAILURE;
        }

        $psid = $this->option('psid') ?: ('sim_' . Str::random(16));
        $text = (string) $this->option('text');
        // Stable per-run mid so repeat runs with the same options demonstrate
        // idempotency (a second run won't create a duplicate message).
        $mid  = 'sim_mid_' . substr(md5($psid . '|' . $text), 0, 24);

        // Build the inner messaging[] entry — exactly the shape Meta sends.
        $payload = [
            'sender'    => ['id' => $psid],
            'recipient' => ['id' => $account->external_id],
            'timestamp' => (int) round(microtime(true) * 1000),
            'message'   => [
                'mid'  => $mid,
                'text' => $text,
            ],
        ];

        $this->info("Simulating inbound webhook on account id={$account->id} (org={$account->organization_id}, brand=" . ($account->brand_id ?? '—') . ")...");
        $this->line("  Sender PSID  : {$psid}");
        $this->line("  Page ID      : {$account->external_id}");
        $this->line("  Text         : {$text}");
        $this->line("  Synth mid    : {$mid}");
        $this->newLine();

        try {
            $message = $this->dispatcher->handleIncoming($account, $payload);
        } catch (\Throwable $e) {
            $this->error('  Dispatcher threw: ' . $e->getMessage());
            $this->line('  ' . $e->getTraceAsString());
            return self::FAILURE;
        }

        if ($message === null) {
            $this->warn('  Dispatcher returned null — most likely a duplicate (mid already exists).');
            $this->line("  Run again with --psid=different or --text=different to produce a unique mid.");
            $this->line("  (This is the expected idempotency behavior, NOT a bug.)");
            return self::SUCCESS;
        }

        $this->info("  ✓ Message persisted (id={$message->id}, conversation_id={$message->conversation_id})");
        $this->line('  → Open /engagement in your admin (logged in as the user whose org matches account.organization_id).');
        $this->line('  → Filter: Priority (default) or Has contact.');
        $this->line('  → The row should appear at the top.');

        $account->refresh();
        $this->newLine();
        $this->line('  Account state after run:');
        $this->line('    last_webhook_at  : ' . ($account->last_webhook_at?->toDateTimeString() ?? 'never'));
        $this->line('    last_error       : ' . ($account->last_error ?? 'none'));

        return self::SUCCESS;
    }
}
