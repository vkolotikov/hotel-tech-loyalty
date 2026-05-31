<?php

namespace App\Console\Commands;

use App\Models\ChatChannelAccount;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Services\Channels\ChannelRouter;
use Illuminate\Console\Command;

/**
 * messenger:simulate-send — fabricate an outbound ChatMessage on a
 * Messenger conversation and route it through ChannelRouter::sendOutbound()
 * so the Send API path is exercised end-to-end against real Meta.
 *
 * Use this to validate Phase 2 outbound wiring without depending on a
 * real admin clicking through the engagement drawer. Especially useful
 * while the app is still in Development mode / awaiting App Review —
 * since Send API calls to YOUR OWN PSID work in Dev mode (you're on App
 * Roles), the response will actually arrive on your Messenger thread.
 *
 * Usage:
 *
 *   php artisan messenger:simulate-send \
 *     --conversation=7719 \
 *     --text="reply from simulate-send" \
 *     --sender=agent
 *
 *   --conversation=N         the chat_conversations row id (Messenger one)
 *   --text="..."             the message body
 *   --sender=agent|ai|system controls the window-rule treatment in router
 *
 * @see MESSENGER_INTEGRATION.md
 */
class MessengerSimulateSend extends Command
{
    protected $signature = 'messenger:simulate-send
        {--conversation= : chat_conversations row id to send into (Messenger conversation required)}
        {--text=hello from simulate-send : Message body}
        {--sender=agent : Sender kind for window-rule treatment (agent|ai|system)}';

    protected $description = 'Simulate an outbound Messenger reply on an existing conversation — exercises the Send API end-to-end against real Meta';

    public function __construct(private readonly ChannelRouter $router)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $convId = (int) ($this->option('conversation') ?? 0);
        if ($convId <= 0) {
            $this->error('--conversation=<id> is required.');
            $this->line('Find a Messenger conversation id with:');
            $this->line("  php artisan tinker --execute=\"\\App\\Models\\ChatConversation::withoutGlobalScopes()->where('channel','messenger')->select('id','organization_id','external_thread_id','last_message_at')->get()->each(fn(\\\$c)=>print(\\\$c->id.' org='.\\\$c->organization_id.' psid='.\\\$c->external_thread_id.PHP_EOL));\"");
            return self::INVALID;
        }

        $conversation = ChatConversation::query()
            ->withoutGlobalScopes()
            ->find($convId);

        if ($conversation === null) {
            $this->error("No conversation found with id={$convId}.");
            return self::FAILURE;
        }

        if ($conversation->channel !== ChatChannelAccount::CHANNEL_MESSENGER) {
            $this->error("Conversation id={$convId} is on channel '{$conversation->channel}', not 'messenger'.");
            $this->line('  Use messenger:simulate-webhook first to create a Messenger conversation.');
            return self::FAILURE;
        }

        $text   = (string) $this->option('text');
        $sender = (string) $this->option('sender');
        if (!in_array($sender, ['agent', 'ai', 'system'], true)) {
            $this->error("--sender must be agent|ai|system (got '{$sender}').");
            return self::INVALID;
        }

        $this->info("Sending outbound to conversation id={$conversation->id} (psid={$conversation->external_thread_id})...");
        $this->line("  Sender kind  : {$sender}");
        $this->line("  Text         : {$text}");
        $this->newLine();

        // Pre-flight diagnostic — checks each precondition the router will
        // check, so the operator sees exactly which gate would block before
        // calling sendOutbound. Catches the most common Phase 2 failure
        // modes (null channel_account, missing token, expired window).
        $this->line('  Pre-flight checks:');
        $allGood = true;

        $accountId = $conversation->channel_account_id;
        $this->line('    conversation.channel_account_id : ' . ($accountId ?? 'NULL'));
        if ($accountId === null) {
            $this->error("      ✗ Conversation has no linked ChatChannelAccount. Router will refuse the send.");
            $this->line('      Fix: link to the right account, e.g.:');
            $this->line("        php artisan tinker --execute=\"\\App\\Models\\ChatConversation::withoutGlobalScopes()->where('id',{$conversation->id})->update(['channel_account_id'=>2]);\"");
            $allGood = false;
        }

        $account = $accountId
            ? \App\Models\ChatChannelAccount::query()->withoutGlobalScopes()->find($accountId)
            : null;

        if ($account !== null) {
            $this->line('    account.status                  : ' . $account->status);
            $tokenPresent = !empty($account->getAttributes()['page_access_token']);
            $this->line('    account.page_access_token       : ' . ($tokenPresent ? 'present' : 'missing'));
            if (!$account->isActive()) {
                $this->error("      ✗ Account isActive() returned false (status='{$account->status}', token=" . ($tokenPresent ? 'present' : 'missing') . ').');
                $allGood = false;
            }
        } else if ($accountId !== null) {
            $this->error("    ✗ ChatChannelAccount id={$accountId} not found (deleted?).");
            $allGood = false;
        }

        // Window check (Messenger-specific). Uses same logic as router.
        $lastInbound = \App\Models\ChatMessage::query()
            ->withoutGlobalScopes()
            ->where('conversation_id', $conversation->id)
            ->where('direction', ChatMessage::DIRECTION_INBOUND)
            ->orderByDesc('created_at')
            ->first(['created_at']);

        if ($lastInbound !== null) {
            $hoursSince = $lastInbound->created_at->diffInHours(now(), false);
            $this->line("    last_inbound_at                 : {$lastInbound->created_at->toDateTimeString()} ({$hoursSince}h ago)");
            if ($hoursSince < 24) {
                $this->line('    window state                    : INSIDE 24h → RESPONSE messaging_type');
            } elseif ($hoursSince < 168 && $sender === 'agent') {
                $this->line('    window state                    : OUTSIDE 24h, INSIDE 7d, sender=agent → HUMAN_AGENT tag');
            } else {
                $this->error("      ✗ Outside the {$sender}-allowed window ({$hoursSince}h since last inbound). Router will refuse.");
                $this->line('      Fix: send a fresh inbound first, OR --sender=agent if within 7 days.');
                $allGood = false;
            }
        } else {
            // No inbound messages at all on this conversation. Window
            // computation treats this as "infinitely past" → blocked.
            $this->error('    last_inbound_at                 : (none) — router treats as past-window → blocked');
            $this->line('    This is unusual for a real conversation. Check chat_messages.direction:');
            $count = \App\Models\ChatMessage::query()
                ->withoutGlobalScopes()
                ->where('conversation_id', $conversation->id)
                ->count();
            $withDir = \App\Models\ChatMessage::query()
                ->withoutGlobalScopes()
                ->where('conversation_id', $conversation->id)
                ->whereNotNull('direction')
                ->count();
            $this->line("      messages on this conversation : {$count} total, {$withDir} have direction set");
            if ($count > 0 && $withDir === 0) {
                $this->line('      → Legacy messages with direction=NULL. Run this to backfill:');
                $this->line("        php artisan tinker --execute=\"\\App\\Models\\ChatMessage::withoutGlobalScopes()->where('conversation_id',{$conversation->id})->whereNull('direction')->where('sender_type','visitor')->update(['direction'=>'inbound']);\"");
            }
            $allGood = false;
        }

        $this->newLine();
        if (!$allGood) {
            $this->error('Pre-flight failed. Fix the items marked ✗ above and re-run.');
            $this->line('No ChatMessage was created (would have been wasted).');
            return self::FAILURE;
        }

        $this->line('  All pre-flight checks passed. Proceeding to send.');
        $this->newLine();

        $message = ChatMessage::create([
            'organization_id' => $conversation->organization_id,
            'conversation_id' => $conversation->id,
            'sender_type'     => $sender,
            'content'         => $text,
            'content_type'    => 'text',
            'direction'       => ChatMessage::DIRECTION_OUTBOUND,
            'is_read'         => false,
            'created_at'      => now(),
        ]);

        $this->line("  Persisted local ChatMessage id={$message->id}");

        $ok = $this->router->sendOutbound($conversation, $message, $sender);

        $message->refresh();
        $this->newLine();
        if ($ok) {
            $this->info('  ✓ Router accepted the send.');
            if ($message->channel_message_id) {
                $this->line("    Meta message id: {$message->channel_message_id}");
            } else {
                $this->warn("    No Meta mid recorded — the dispatcher returned empty (rare; check logs).");
            }
            $this->line('  → Check your Facebook Messenger inbox for the message to arrive within seconds.');
        } else {
            $this->error('  ✗ Router returned failure even though pre-flight passed.');
            $account?->refresh();
            if ($account && $account->last_error) {
                $this->line("    Account.last_error: {$account->last_error}");
            }
            $this->line('    Look for "channel_router.*" entries in Nightwatch for the full trace.');
        }

        return self::SUCCESS;
    }
}
