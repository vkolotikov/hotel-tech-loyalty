<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where to email the venue when a visitor asks for a human.
 *
 * The widget can already hand a visitor to WhatsApp, but that only covers
 * venues that use WhatsApp, and it tells the team nothing when the visitor
 * stays in the chat. The existing inbox alert requires the inbox to already be
 * open, so a handoff outside working hours reached nobody — a promise the
 * venue then broke without knowing it had been made.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->string('handoff_email', 190)->nullable()->after('handoff_whatsapp');
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn('handoff_email');
        });
    }
};
