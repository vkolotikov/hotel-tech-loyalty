<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->string('entry_source_channel', 20)->nullable();
            $table->string('entry_source_site', 40)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', fn (Blueprint $table) => $table->dropColumn(['entry_source_channel', 'entry_source_site']));
    }
};
