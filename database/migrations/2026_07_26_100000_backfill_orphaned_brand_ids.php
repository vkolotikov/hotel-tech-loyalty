<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Rescue records that are invisible in EVERY brand.
 *
 * BrandScope filters `brand_id = <selected brand>`. A row with brand_id
 * NULL therefore matches no brand at all — it only ever appears in the
 * admin's "All brands" mode. Rows created before the brand columns
 * existed (or by any path that skipped brand stamping) are effectively
 * lost: visitors, chat conversations and leads that no one can see while
 * working brand-by-brand.
 *
 * Backfill each orphan to its organisation's default brand — which is by
 * definition the brand the org had when the row was written. Conversation
 * orphans prefer their visitor's brand when that is known, so a chat keeps
 * the brand its visitor already belongs to.
 *
 * Idempotent: only touches rows where brand_id IS NULL.
 */
return new class extends Migration {
    /** Brand-scoped tables holding customer communications / records. */
    private const TABLES = ['visitors', 'chat_conversations', 'inquiries', 'booking_submissions'];

    public function up(): void
    {
        // 1. Conversations inherit their visitor's brand where possible —
        //    more accurate than falling back to the org default.
        if ($this->usable('chat_conversations') && $this->usable('visitors')) {
            DB::statement("
                UPDATE chat_conversations c
                   SET brand_id = v.brand_id
                  FROM visitors v
                 WHERE c.visitor_id = v.id
                   AND c.brand_id IS NULL
                   AND v.brand_id IS NOT NULL
            ");
        }

        // 2. Everything still orphaned goes to the org's default brand.
        foreach (self::TABLES as $table) {
            if (!$this->usable($table)) {
                continue;
            }

            $before = DB::table($table)->whereNull('brand_id')->count();
            if ($before === 0) {
                continue;
            }

            DB::statement("
                UPDATE {$table} t
                   SET brand_id = b.id
                  FROM brands b
                 WHERE t.brand_id IS NULL
                   AND b.organization_id = t.organization_id
                   AND b.is_default = true
                   AND b.deleted_at IS NULL
            ");

            $after = DB::table($table)->whereNull('brand_id')->count();
            Log::info("backfill_orphaned_brand_ids: {$table}", [
                'orphans_before' => $before,
                'recovered'      => $before - $after,
                // Remainder = rows whose org has no default brand at all.
                'still_null'     => $after,
            ]);
        }
    }

    public function down(): void
    {
        // Irreversible by design: the original NULLs carried no information,
        // and re-nulling would hide the records again.
    }

    private function usable(string $table): bool
    {
        return Schema::hasTable($table)
            && Schema::hasColumn($table, 'brand_id')
            && Schema::hasColumn($table, 'organization_id');
    }
};
