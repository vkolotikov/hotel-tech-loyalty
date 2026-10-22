<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Expo receipts for push messages (HexaTech Loyalty release 4 §5). Expo's answer to a push is a ticket ("accepted");
 * whether Apple or Google then took it is a receipt, read later by the ticket's id. Three nullable columns on
 * push_message_deliveries:
 *
 *  - `ticket_id`: Expo's ticket for the push (SendPushMessageChunk writes it with `sent`);
 *  - `token_hash`: the SHA-256 of the device token the push went to, so that a receipt saying the device is gone
 *    (`DeviceNotRegistered`) clears the member's token only while it is still that one — never a newer device the
 *    member registered since. The token itself is not copied here;
 *  - `receipt_at`: when the receipt was read (`php artisan loyalty:push-receipts`, every 15 minutes); a row with a
 *    ticket and no `receipt_at` is still to be asked about.
 *
 * Nullable columns only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('push_message_deliveries', function (Blueprint $t) {
            $t->string('ticket_id', 64)->nullable();
            $t->string('token_hash', 64)->nullable();
            $t->timestamp('receipt_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('push_message_deliveries', function (Blueprint $t) {
            $t->dropColumn(['ticket_id', 'token_hash', 'receipt_at']);
        });
    }
};
