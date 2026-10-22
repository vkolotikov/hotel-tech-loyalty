<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The member's own SMS opt-in (HexaTech Loyalty release 4, owner decision R4-4): "Offers by SMS", off until the member
 * turns it on in the app or the portal (PUT /v1/member/profile `sms_consent`); only members who turned it on are sent
 * an SMS. NULL reads as off, the same as false.
 *
 * One nullable column with a constant default: on PostgreSQL 11 and later this is a catalogue change only (no table
 * rewrite), safe with `migrate --force` on a live database; every existing member reads as off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('loyalty_members', function (Blueprint $t) {
            $t->boolean('sms_consent')->nullable()->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('loyalty_members', function (Blueprint $t) {
            $t->dropColumn('sms_consent');
        });
    }
};
