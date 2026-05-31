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
            $this->error('  ✗ Router skipped or failed the send.');
            $this->line('    Common causes:');
            $this->line('      - Conversation past the 24h Messenger window (and sender is not "agent")');
            $this->line('      - ChannelAccount status != active or token missing');
            $this->line('      - pages_messaging not in Advanced Access (App Review pending — works for App Roles users only)');
            $this->line('    Look for "channel_router.*" in Nightwatch logs.');
        }

        return self::SUCCESS;
    }
}
