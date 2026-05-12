<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add structured block storage to email_campaigns. body_html remains
 * the authoritative output for sending, but body_blocks lets the
 * builder UI round-trip cleanly without parsing HTML back into blocks.
 *
 * Nullable on purpose — legacy / code-edited campaigns have no blocks
 * and the UI falls back to the raw HTML editor for those.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_campaigns', function (Blueprint $t) {
            $t->jsonb('body_blocks')->nullable()->after('body_text');
        });
    }

    public function down(): void
    {
        Schema::table('email_campaigns', function (Blueprint $t) {
            $t->dropColumn('body_blocks');
        });
    }
};
