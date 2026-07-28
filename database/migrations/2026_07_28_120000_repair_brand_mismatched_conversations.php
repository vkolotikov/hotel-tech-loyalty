<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Make historically-invisible conversations reachable again.
 *
 * Until the brand-aware fingerprint fix, resolveVisitor() identified a
 * visitor by org + IP + User-Agent only. In a multi-brand org that produced
 * ONE visitor row per person, pinned (BelongsToBrand stamps once, on insert)
 * to whichever brand they hit first. Chatting later on another brand stamped
 * the conversation with brand B while the visitor row still said brand A.
 *
 * The Engagement feed is visitor-centric — Visitor::query() narrowed by
 * BrandScope, then whereHas('conversations') — so such a conversation is
 * filtered out under BOTH brands: stored correctly, displayable nowhere.
 *
 * Repair: give each mismatched conversation a visitor row that lives in the
 * conversation's own brand, cloned from the original identity, and re-point
 * the conversation at it. The original row is left untouched so the other
 * brand's history is unaffected.
 *
 * Deterministic + idempotent: the cloned key is derived by hashing the
 * original key with the brand, so re-running finds the same row.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('chat_conversations') || !Schema::hasTable('visitors')) {
            return;
        }
        if (!Schema::hasColumn('chat_conversations', 'brand_id') || !Schema::hasColumn('visitors', 'brand_id')) {
            return;
        }

        $repaired = 0;
        $created  = 0;

        DB::table('chat_conversations as cc')
            ->join('visitors as v', 'v.id', '=', 'cc.visitor_id')
            ->whereNotNull('cc.brand_id')
            ->whereNotNull('v.brand_id')
            ->whereColumn('cc.brand_id', '!=', 'v.brand_id')
            ->select([
                'cc.id as conversation_id',
                'cc.brand_id as conversation_brand_id',
                'cc.organization_id',
                'v.id as visitor_id',
                'v.visitor_key',
                'v.visitor_ip',
                'v.user_agent',
                'v.country',
                'v.city',
                'v.first_seen_at',
                'v.last_seen_at',
                'v.email',
                'v.phone',
                'v.display_name',
                'v.is_lead',
            ])
            ->orderBy('cc.id')
            ->chunk(500, function ($rows) use (&$repaired, &$created) {
                foreach ($rows as $row) {
                    // Deterministic per-brand identity derived from the original.
                    $key = hash('sha256', $row->visitor_key . '|brand:' . $row->conversation_brand_id);

                    $target = DB::table('visitors')
                        ->where('organization_id', $row->organization_id)
                        ->where('visitor_key', $key)
                        ->value('id');

                    if (!$target) {
                        $target = DB::table('visitors')->insertGetId([
                            'organization_id' => $row->organization_id,
                            'brand_id'        => $row->conversation_brand_id,
                            'visitor_key'     => $key,
                            'visitor_ip'      => $row->visitor_ip,
                            'user_agent'      => $row->user_agent,
                            'country'         => $row->country,
                            'city'            => $row->city,
                            'email'           => $row->email,
                            'phone'           => $row->phone,
                            'display_name'    => $row->display_name,
                            'is_lead'         => $row->is_lead ?? false,
                            'first_seen_at'   => $row->first_seen_at,
                            'last_seen_at'    => $row->last_seen_at,
                            'visit_count'     => 1,
                            'created_at'      => now(),
                            'updated_at'      => now(),
                        ]);
                        $created++;
                    }

                    DB::table('chat_conversations')
                        ->where('id', $row->conversation_id)
                        ->update(['visitor_id' => $target]);
                    $repaired++;
                }
            });

        if ($repaired > 0) {
            Log::info('repair_brand_mismatched_conversations', [
                'conversations_repaired' => $repaired,
                'visitor_rows_created'   => $created,
            ]);
        }
    }

    public function down(): void
    {
        // Irreversible by design — the previous linkage made these
        // conversations invisible in every brand.
    }
};
