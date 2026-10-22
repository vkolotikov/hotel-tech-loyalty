<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The member inbox (release 3 §3). Before this release NotificationService wrote every push_notifications row with
 * `is_sent` false and nothing ever set it, while the app's inbox and the portal's unread count read only rows with
 * `is_sent` true: every inbox was empty. Now a row is the notification kept for the member's inbox, written sent.
 *
 * The rows written before are marked the same way — sent when they were written — and already read, so no member
 * opens the app to a pile of unread old notifications. One UPDATE, on the rows that still say `is_sent` false only (a
 * second run changes nothing); no column or type change, so no table rewrite.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('push_notifications')->where('is_sent', false)->update([
            'is_sent' => true,
            'sent_at' => DB::raw('COALESCE(sent_at, created_at, CURRENT_TIMESTAMP)'),
            'read_at' => DB::raw('COALESCE(read_at, created_at, CURRENT_TIMESTAMP)'),
        ]);
    }

    /**
     * Nothing to undo: which rows this changed is not recorded, and putting `is_sent` back to false would only empty
     * the inboxes again.
     */
    public function down(): void
    {
    }
};
