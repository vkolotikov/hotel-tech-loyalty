<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give tiers the description the UI has always asked for.
 *
 * `TierController` validates `description`, `Tiers.tsx` renders a textarea
 * for it, and the admin gets a green "Tier updated" toast — but there is
 * no such column, so `LoyaltyTier::create($validated)` dropped it on the
 * floor every single time.
 *
 * Adding the column rather than removing the field: describing what a tier
 * gets you is genuinely useful, the UI is already built, and admins have
 * been typing into it expecting it to stick.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('loyalty_tiers') || Schema::hasColumn('loyalty_tiers', 'description')) {
            return;
        }

        Schema::table('loyalty_tiers', function (Blueprint $t) {
            $t->text('description')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('loyalty_tiers') || !Schema::hasColumn('loyalty_tiers', 'description')) {
            return;
        }

        Schema::table('loyalty_tiers', function (Blueprint $t) {
            $t->dropColumn('description');
        });
    }
};
