<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Talk to a person" — hand the visitor to WhatsApp.
 *
 * The widget had no way for a visitor to ask for a human. Escalation depended
 * on the AI noticing intent in the message text, matched against an
 * English-only phrase list, so a visitor writing in any other language — or
 * simply phrasing it unusually — had no route out of the bot at all.
 *
 * WhatsApp rather than an inbox handoff because the inbox alerts nobody unless
 * a staff member already has it open. A wa.me link reaches a phone that is
 * already in someone's pocket, and every venue this product serves already
 * runs their customer contact through it.
 *
 * ONE column, deliberately. There is no separate enable/disable toggle: the
 * button appears when a number is set and disappears when it is cleared.
 * The settings screens in this module are already criticised for asking
 * questions the owner cannot answer, and "enabled, but with no number" is a
 * state that only exists to be got wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            // E.164 with room for formatting the admin may paste; normalised to
            // digits when the wa.me URL is built, both here and in the widget.
            $table->string('handoff_whatsapp', 32)->nullable()->after('offline_message');
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn('handoff_whatsapp');
        });
    }
};
