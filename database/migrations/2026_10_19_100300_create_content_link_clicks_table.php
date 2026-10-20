<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clicks on HexaTech Content's tracked links (spec 2026-10-19 §5.4, §7.1): one row per link, venue day and source
 * (`direct` | `bio`), raised by one in a single upsert. Nothing about the visitor is stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_link_clicks')) {
            return;
        }
        Schema::create('content_link_clicks', function (Blueprint $table) {
            $table->foreignId('link_id')->constrained('content_links')->cascadeOnDelete();
            $table->date('day');
            $table->string('via', 6);
            $table->unsignedInteger('clicks')->default(0);
            $table->unique(['link_id', 'day', 'via']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_link_clicks');
    }
};
