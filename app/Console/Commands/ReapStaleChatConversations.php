<?php

namespace App\Console\Commands;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use Illuminate\Console\Command;

/**
 * Auto-resolves chat conversations that have been sitting idle in active or
 * waiting status with no new messages for a configurable number of hours.
 * Without this, abandoned widget sessions clutter the inbox forever and
 * skew "active" / "waiting" stats.
 *
 * Schedule from bootstrap/app.php:
 *   $schedule->command('chat:reap')->hourly();
 */
class ReapStaleChatConversations extends Command
{
    protected $signature = 'chat:reap {--hours=4 : Hours of inactivity before resolving} {--dry-run : Show what would be reaped without actually doing it}';

    protected $description = 'Auto-resolve chat conversations that have been idle for too long';

    public function handle(): int
    {
        $hours = (int) $this->option('hours');
        $dryRun = (bool) $this->option('dry-run');
        $cutoff = now()->subHours($hours);

        $stale = ChatConversation::whereIn('status', ['active', 'waiting'])
            ->where(function ($q) use ($cutoff) {
                $q->where('last_message_at', '<', $cutoff)
                  ->orWhereNull('last_message_at');
            })
            ->get();

        $this->info("Found {$stale->count()} stale conversations (idle > {$hours}h)");

        if ($stale->isEmpty()) return self::SUCCESS;
        if ($dryRun) {
            foreach ($stale as $c) {
                $this->line("  #{$c->id} — {$c->visitor_name} — last: {$c->last_message_at}");
            }
            return self::SUCCESS;
        }

        foreach ($stale as $conv) {
            $conv->update([
                'status'           => 'resolved',
                'rating_requested' => $conv->rating_requested ?: true,
            ]);
            ChatMessage::create([
                'conversation_id' => $conv->id,
                'sender_type'     => 'system',
                'content'         => "Auto-resolved after {$hours}h of inactivity",
                'created_at'      => now(),
            ]);
        }

        $this->info("Reaped {$stale->count()} conversations");
        return self::SUCCESS;
    }
}
