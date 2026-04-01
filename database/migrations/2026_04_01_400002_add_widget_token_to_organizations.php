<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Add an opaque widget_token to organizations so the public booking widget
 * uses non-guessable tokens instead of sequential integer IDs.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('organizations', 'widget_token')) {
            Schema::table('organizations', function (Blueprint $table) {
                $table->string('widget_token', 64)->nullable()->unique()->after('saas_org_id');
            });
        }

        // Backfill existing organizations with a random token
        foreach (DB::table('organizations')->whereNull('widget_token')->get() as $org) {
            DB::table('organizations')
                ->where('id', $org->id)
                ->update(['widget_token' => Str::random(32)]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('organizations', 'widget_token')) {
            Schema::table('organizations', function (Blueprint $table) {
                $table->dropColumn('widget_token');
            });
        }
    }
};
