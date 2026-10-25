<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Places a venue admits members to — an entrance, a lounge, a spa — and which tiers each admits (HexaTech Loyalty release
 * 8, spec 2026-10-25 §1). Written only by App\Services\Loyalty\Access\AccessPlaces; decided only by AccessDecision.
 *
 * `scan_events` gains the place (an entry) and the event (a check-in) a scan was for, both nullable: a scan at the desk
 * names neither, as every scan before this release.
 *
 * New tables and nullable columns only: safe with `migrate --force` on a live database.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('access_places')) {
            Schema::create('access_places', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->string('name', 80);
                $t->string('description', 300)->nullable();
                $t->string('admits', 10)->default('all');
                $t->unsignedInteger('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
                $t->index(['organization_id', 'is_active']);
            });
        }
        if (!Schema::hasTable('access_place_tiers')) {
            Schema::create('access_place_tiers', function (Blueprint $t) {
                $t->id();
                $t->foreignId('access_place_id')->constrained('access_places')->cascadeOnDelete();
                $t->foreignId('tier_id')->constrained('loyalty_tiers')->cascadeOnDelete();
                $t->unique(['access_place_id', 'tier_id'], 'access_place_tiers_pair_unique');
            });
        }
        Schema::table('scan_events', function (Blueprint $t) {
            if (!Schema::hasColumn('scan_events', 'access_place_id')) {
                $t->foreignId('access_place_id')->nullable()->constrained('access_places')->nullOnDelete();
            }
            if (!Schema::hasColumn('scan_events', 'loyalty_event_id')) {
                // The events table comes in 2026_10_25_150000; the foreign key is added there.
                $t->unsignedBigInteger('loyalty_event_id')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('scan_events', function (Blueprint $t) {
            if (Schema::hasColumn('scan_events', 'access_place_id')) {
                $t->dropConstrainedForeignId('access_place_id');
            }
            if (Schema::hasColumn('scan_events', 'loyalty_event_id')) {
                $t->dropIndex(['loyalty_event_id']);
                $t->dropColumn('loyalty_event_id');
            }
        });
        Schema::dropIfExists('access_place_tiers');
        Schema::dropIfExists('access_places');
    }
};
