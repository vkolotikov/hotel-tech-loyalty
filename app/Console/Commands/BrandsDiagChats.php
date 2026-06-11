<?php

namespace App\Console\Commands;

use App\Models\Brand;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\Visitor;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Diagnose why an org's chat data isn't appearing in the Engagement Hub.
 *
 * Bypasses ALL global scopes (TenantScope + BrandScope) and reports:
 *   - Brand inventory (active, soft-deleted, default flag)
 *   - chat_conversations / chat_messages / visitors counts
 *   - brand_id distribution on each (live + tombstoned + NULL)
 *   - Recent conversations sample
 *
 * Usage:
 *   php artisan brands:diag-chats --org=12
 */
class BrandsDiagChats extends Command
{
    protected $signature = 'brands:diag-chats {--org= : Org id (required)}';
    protected $description = 'Diagnose chat-data brand attribution for an org';

    public function handle(): int
    {
        $orgId = (int) $this->option('org');
        if (!$orgId) {
            $this->error('--org=N is required');
            return self::FAILURE;
        }

        $this->info("=== Org #{$orgId} chat-data diagnostic ===");
        $this->newLine();

        // ── Brands inventory
        $this->info('BRANDS (including soft-deleted):');
        $brands = Brand::withoutGlobalScopes()
            ->withTrashed()
            ->where('organization_id', $orgId)
            ->orderBy('id')
            ->get(['id', 'name', 'slug', 'is_default', 'deleted_at', 'created_at']);
        if ($brands->isEmpty()) {
            $this->warn('  (none)');
        } else {
            foreach ($brands as $b) {
                $flags = [];
                if ($b->is_default) $flags[] = 'DEFAULT';
                if ($b->deleted_at) $flags[] = 'SOFT-DELETED@' . $b->deleted_at;
                $flagStr = $flags ? ' [' . implode(' ', $flags) . ']' : '';
                $this->line("  #{$b->id} '{$b->name}' ({$b->slug}){$flagStr} — created {$b->created_at}");
            }
        }
        $this->newLine();

        // ── chat_conversations
        $this->info('CHAT_CONVERSATIONS:');
        $convTotal = ChatConversation::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->count();
        $this->line("  total in org: {$convTotal}");
        if ($convTotal === 0) {
            $this->warn("  → No chat conversations exist for this org. The Engagement Hub will correctly show empty.");
            $this->warn("    If you expected chats: were they actually created via the chat widget? Or were they in a different org?");
        } else {
            // Per-brand distribution
            $rows = DB::table('chat_conversations')
                ->select('brand_id', DB::raw('count(*) as n'))
                ->where('organization_id', $orgId)
                ->groupBy('brand_id')
                ->orderByDesc('n')
                ->get();
            foreach ($rows as $r) {
                $brandName = '(NULL — orphaned)';
                $brandStatus = '';
                if ($r->brand_id !== null) {
                    $b = $brands->firstWhere('id', (int) $r->brand_id);
                    if ($b) {
                        $brandName = "#{$b->id} '{$b->name}'";
                        if ($b->deleted_at) $brandStatus = ' (BRAND SOFT-DELETED)';
                    } else {
                        $brandName = "#{$r->brand_id} (BRAND NOT FOUND — points at tombstoned id)";
                        $brandStatus = ' (BRAND HARD-DELETED — rows orphaned)';
                    }
                }
                $this->line("  brand_id {$r->brand_id}: {$r->n} conv → {$brandName}{$brandStatus}");
            }
        }
        $this->newLine();

        // ── visitors
        $this->info('VISITORS:');
        $vTotal = Visitor::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->count();
        $this->line("  total in org: {$vTotal}");
        if ($vTotal > 0) {
            $rows = DB::table('visitors')
                ->select('brand_id', DB::raw('count(*) as n'))
                ->where('organization_id', $orgId)
                ->groupBy('brand_id')
                ->orderByDesc('n')
                ->get();
            foreach ($rows as $r) {
                $brandName = '(NULL)';
                if ($r->brand_id !== null) {
                    $b = $brands->firstWhere('id', (int) $r->brand_id);
                    $brandName = $b ? "#{$b->id} '{$b->name}'" : "#{$r->brand_id} (orphaned)";
                }
                $this->line("  brand_id {$r->brand_id}: {$r->n} visitors → {$brandName}");
            }
        }
        $this->newLine();

        // ── chat_messages
        $msgTotal = ChatMessage::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->count();
        $this->info("CHAT_MESSAGES total: {$msgTotal}");
        $this->newLine();

        // ── Sample of recent conversations
        if ($convTotal > 0) {
            $this->info('RECENT CONVERSATIONS (last 10):');
            $sample = ChatConversation::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->orderByDesc('id')
                ->limit(10)
                ->get(['id', 'brand_id', 'visitor_id', 'visitor_name', 'visitor_email', 'channel', 'status', 'last_message_at', 'created_at']);
            foreach ($sample as $c) {
                $who = $c->visitor_name ?: $c->visitor_email ?: '(anon)';
                $this->line("  conv #{$c->id} brand={$c->brand_id} channel={$c->channel} status={$c->status} {$who} last={$c->last_message_at}");
            }
        }
        $this->newLine();

        // ── Verdict
        $this->info('VERDICT:');
        if ($convTotal === 0) {
            $this->warn('  No conversations in DB for this org. Engagement Hub correctly shows empty.');
            $this->warn('  Action: confirm whether you ever had chats here. Maybe under a different login / org?');
        } elseif ($convTotal > 0) {
            $orphaned = DB::table('chat_conversations')
                ->where('organization_id', $orgId)
                ->whereNotNull('brand_id')
                ->whereNotIn('brand_id', $brands->pluck('id')->all())
                ->count();
            $nullBrand = DB::table('chat_conversations')
                ->where('organization_id', $orgId)
                ->whereNull('brand_id')
                ->count();
            if ($orphaned > 0) {
                $this->warn("  {$orphaned} conv(s) point at brand_ids that don't exist anymore (hard-deleted brands).");
                $this->warn("  These are invisible in EVERY brand view AND in 'All brands' mode (BrandScope filters by id).");
                $this->warn("  Action: re-run brands:heal-orphan-rows after setting their brand_id to NULL first, OR re-attribute via update.");
            }
            if ($nullBrand > 0) {
                $this->warn("  {$nullBrand} conv(s) have brand_id=NULL. Visible only in 'All brands' mode.");
            }
            $tombstoned = DB::table('chat_conversations as c')
                ->join('brands as b', 'c.brand_id', '=', 'b.id')
                ->where('c.organization_id', $orgId)
                ->whereNotNull('b.deleted_at')
                ->count();
            if ($tombstoned > 0) {
                $this->warn("  {$tombstoned} conv(s) point at SOFT-DELETED brand_ids.");
                $this->warn("  These show in 'All brands' mode but NOT under any specific brand pick.");
            }
            if ($orphaned === 0 && $nullBrand === 0 && $tombstoned === 0) {
                $this->info("  All conversations point at valid live brands. They SHOULD be visible in 'All brands' mode.");
                $this->info("  If Engagement Hub still shows empty, the issue is in EngagementFeedService filter logic, not brand attribution.");
            }
        }

        return self::SUCCESS;
    }
}
