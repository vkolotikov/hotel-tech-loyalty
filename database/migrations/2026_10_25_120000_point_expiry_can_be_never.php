<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Points that never expire (HexaTech Loyalty release 7, spec 2026-10-25 §4.4): `point_expiry_buckets.expires_at` may be
 * empty — written when the venue's `points_expiry_months` is 0, which until now expired the points at once. Dropping a
 * NOT NULL is a catalogue change on PostgreSQL. `down()` refuses while an empty one exists rather than invent a date.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('point_expiry_buckets')) {
            Schema::table('point_expiry_buckets', fn (Blueprint $t) => $t->date('expires_at')->nullable()->change());
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('point_expiry_buckets')) {
            return;
        }
        if (\Illuminate\Support\Facades\DB::table('point_expiry_buckets')->whereNull('expires_at')->exists()) {
            throw new \RuntimeException('Points that never expire exist; give them an expiry date before rolling this back.');
        }
        Schema::table('point_expiry_buckets', fn (Blueprint $t) => $t->date('expires_at')->nullable(false)->change());
    }
};
