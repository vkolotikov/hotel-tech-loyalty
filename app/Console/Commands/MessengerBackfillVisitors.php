<?php

namespace App\Console\Commands;

use App\Models\ChatChannelAccount;
use App\Models\ChatConversation;
use App\Models\Visitor;
use Illuminate\Console\Command;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * messenger:backfill-visitors — create Visitor rows for Messenger
 * conversations that were created before the dispatcher started
 * linking them.
 *
 * Background: EngagementFeedService::feed() queries OUT FROM Visitor
 * rows; a ChatConversation with visitor_id=NULL is invisible there.
 * Early Phase 1 Messenger conversations were persisted without
 * creating a Visitor — this command heals them in bulk.
 *
 * One-shot ops tool. After the dispatcher patch ships and this runs
 * once on prod, future Messenger conversations get their Visitor row
 * created inline. No re-run necessary unless we somehow accumulate
 * more orphans (we shouldn't).
 *
 * Usage:
 *   php artisan messenger:backfill-visitors          # backfill all orgs
 *   php artisan messenger:backfill-visitors --dry-run # report what would happen
 *   php artisan messenger:backfill-visitors --org=N   # one org only
 *
 * Safe to re-run — uses the same idempotent resolve-or-create pattern
 * the dispatcher uses (UNIQUE constraint on org_id + visitor_key).
 *
 * @see App\Services\Channels\MessengerDispatcher::resolveVisitor
 */
class MessengerBackfillVisitors extends Command
{
    protected $signature = 'messenger:backfill-visitors
        {--org= : Limit to a single organization id}
        {--dry-run : Report what would be backfilled without writing}';

    protected $description = 'Create Visitor rows for legacy Messenger conversations with visitor_id=NULL so they show up in /engagement';

    public function handle(): int
    {
        $orgFilter = $this->option('org') !== null ? (int) $this->option('org') : null;
        $dryRun = (bool) $this->option('dry-run');

        $orphans = ChatConversation::query()
            ->withoutGlobalScopes()
            ->where('channel', ChatChannelAccount::CHANNEL_MESSENGER)
            ->whereNull('visitor_id')
            ->when($orgFilter !== null, fn ($q) => $q->where('organization_id', $orgFilter))
            ->orderBy('id')
            ->get();

        if ($orphans->isEmpty()) {
            $this->info('No orphan Messenger conversations found.');
            return self::SUCCESS;
        }

        $this->info("Found {$orphans->count()} orphan Messenger conversation(s):");

        $created = 0;
        $linked  = 0;
        $skipped = 0;

        foreach ($orphans as $conv) {
            $line = "  conv id={$conv->id} org={$conv->organization_id} psid={$conv->external_thread_id}";
            if ($conv->external_thread_id === null || $conv->external_thread_id === '') {
                $this->warn("{$line} → SKIPPED (no external_thread_id)");
                $skipped++;
                continue;
            }

            if ($dryRun) {
                $this->line("{$line} → would create + link Visitor");
                continue;
            }

            $visitor = $this->resolveOrCreateVisitor($conv);
            if ($visitor === null) {
                $this->error("{$line} → FAILED to resolve visitor (no brand_id available?)");
                $skipped++;
                continue;
            }

            $isNewVisitor = $visitor->wasRecentlyCreated;
            $conv->forceFill(['visitor_id' => $visitor->id])->save();

            $this->line("{$line} → visitor id={$visitor->id} " . ($isNewVisitor ? '(created)' : '(reused existing)'));
            if ($isNewVisitor) $created++;
            $linked++;
        }

        $this->newLine();
        if ($dryRun) {
            $this->info("Dry run complete. {$orphans->count()} conversation(s) would have been processed.");
        } else {
            $this->info("Done. visitors created: {$created}, conversations linked: {$linked}, skipped: {$skipped}.");
        }
        return self::SUCCESS;
    }

    private function resolveOrCreateVisitor(ChatConversation $conv): ?Visitor
    {
        $visitorKey = 'fb:' . $conv->external_thread_id;

        $existing = Visitor::query()->withoutGlobalScopes()
            ->where('organization_id', $conv->organization_id)
            ->where('visitor_key', $visitorKey)
            ->first();
        if ($existing !== null) {
            return $existing;
        }

        try {
            $visitor = Visitor::create([
                'organization_id'  => $conv->organization_id,
                'brand_id'         => $conv->brand_id,
                'visitor_key'      => $visitorKey,
                'display_name'     => $conv->visitor_name ?: 'Messenger user',
                'first_seen_at'    => $conv->created_at,
                'last_seen_at'     => $conv->last_message_at ?? $conv->created_at,
                'visit_count'      => 1,
                'page_views_count' => 0,
                'messages_count'   => (int) ($conv->messages_count ?? 0),
                'is_lead'          => (bool) ($conv->lead_captured ?? false),
            ]);
            $visitor->wasRecentlyCreated = true;
            return $visitor;
        } catch (UniqueConstraintViolationException) {
            return Visitor::query()->withoutGlobalScopes()
                ->where('organization_id', $conv->organization_id)
                ->where('visitor_key', $visitorKey)
                ->first();
        }
    }
}
