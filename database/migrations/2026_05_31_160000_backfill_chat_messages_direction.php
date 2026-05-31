<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill chat_messages.direction for legacy rows.
 *
 * Why this matters:
 *
 *   - ChannelRouter::lastInboundAt() filters by direction='inbound' to
 *     compute the 24h Messenger reply-window. Rows with NULL direction
 *     are skipped, so a conversation with only legacy inbound rows
 *     returns PHP_INT_MAX hours-since-last-inbound and blocks every
 *     outbound send (false-positive window expiry).
 *
 *   - The read-receipt path filters outbound rows by direction='outbound'
 *     to mark them delivered/read; legacy rows whose direction was never
 *     stamped silently miss receipts.
 *
 * Going forward every ChatMessage::create site stamps 'direction' at
 * insert time (one of inbound | outbound). This migration is the
 * one-shot cleanup for rows created before that.
 *
 * The two UPDATEs are bounded by `direction IS NULL` so re-running is a
 * no-op once stamped. A single statement is fine on Postgres for the
 * sizes we have today; no chunking needed.
 *
 * Sender-type → direction mapping:
 *   visitor                        → inbound  (the human guest / member)
 *   ai | agent | system | bot      → outbound (us replying)
 *
 * `bot` is included as a defensive catch-all — historically a couple of
 * code paths used it instead of 'ai'.
 */
return new class extends Migration {
    public function up(): void
    {
        DB::table('chat_messages')
            ->whereNull('direction')
            ->where('sender_type', 'visitor')
            ->update(['direction' => 'inbound']);

        DB::table('chat_messages')
            ->whereNull('direction')
            ->whereIn('sender_type', ['ai', 'agent', 'system', 'bot'])
            ->update(['direction' => 'outbound']);
    }

    public function down(): void
    {
        // Intentional no-op. Direction is now a real signal that downstream
        // code relies on; reverting it to NULL would break the window-rule
        // and read-receipt paths we just hardened.
    }
};
