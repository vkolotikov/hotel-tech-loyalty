<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Events a venue runs and members attend (HexaTech Loyalty release 8, spec 2026-10-25 §4): the event, the tiers it is
 * for, members' sign-ups (from the portal or by staff) and check-ins (one per member per event). Written only by
 * App\Services\Loyalty\Events\*.
 *
 * `starts_at` / `ends_at` are the venue's wall clock, stored as written and never converted (as appointment times).
 * A check-in's points line and its scan are kept on the attendance row.
 *
 * New tables only (and a foreign key on release 8's `scan_events.loyalty_event_id`): safe with `migrate --force`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('loyalty_events')) {
            Schema::create('loyalty_events', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->string('title', 120);
                $t->text('description')->nullable();
                $t->dateTime('starts_at');
                $t->dateTime('ends_at');
                $t->foreignId('access_place_id')->nullable()->constrained('access_places')->nullOnDelete();
                $t->string('location', 200)->nullable();
                $t->unsignedInteger('points')->default(0);
                $t->boolean('counts_as_visit')->default(true);
                $t->string('admits', 10)->default('all');
                $t->boolean('sign_up')->default(false);
                $t->boolean('walk_ins')->default(true);
                $t->unsignedInteger('capacity')->nullable();
                $t->string('status', 12)->default('draft');
                $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $t->timestamps();
                $t->index(['organization_id', 'status', 'starts_at']);
            });
        }
        if (!Schema::hasTable('loyalty_event_tiers')) {
            Schema::create('loyalty_event_tiers', function (Blueprint $t) {
                $t->id();
                $t->foreignId('loyalty_event_id')->constrained('loyalty_events')->cascadeOnDelete();
                $t->foreignId('tier_id')->constrained('loyalty_tiers')->cascadeOnDelete();
                $t->unique(['loyalty_event_id', 'tier_id'], 'loyalty_event_tiers_pair_unique');
            });
        }
        if (!Schema::hasTable('loyalty_event_registrations')) {
            Schema::create('loyalty_event_registrations', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('loyalty_event_id')->constrained('loyalty_events')->cascadeOnDelete();
                $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $t->string('status', 12)->default('signed_up');
                $t->string('source', 10)->default('portal');
                $t->timestamp('signed_up_at')->nullable();
                $t->timestamp('cancelled_at')->nullable();
                $t->timestamps();
                $t->unique(['loyalty_event_id', 'member_id'], 'loyalty_event_registrations_member_unique');
                $t->index('member_id');
            });
        }
        if (!Schema::hasTable('loyalty_event_attendances')) {
            Schema::create('loyalty_event_attendances', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('loyalty_event_id')->constrained('loyalty_events')->cascadeOnDelete();
                $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
                $t->timestamp('checked_in_at');
                $t->foreignId('checked_in_by')->nullable()->constrained('users')->nullOnDelete();
                $t->boolean('walk_in')->default(false);
                $t->foreignId('scan_event_id')->nullable()->constrained('scan_events')->nullOnDelete();
                $t->foreignId('points_transaction_id')->nullable()->constrained('points_transactions')->nullOnDelete();
                $t->timestamps();
                $t->unique(['loyalty_event_id', 'member_id'], 'loyalty_event_attendances_member_unique');
                $t->index('member_id');
            });
        }
        if (Schema::hasColumn('scan_events', 'loyalty_event_id') && !$this->hasEventForeignKey()) {
            Schema::table('scan_events', function (Blueprint $t) {
                $t->foreign('loyalty_event_id', 'scan_events_loyalty_event_id_foreign')->references('id')->on('loyalty_events')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('scan_events', 'loyalty_event_id') && $this->hasEventForeignKey()) {
            Schema::table('scan_events', function (Blueprint $t) {
                $t->dropForeign('scan_events_loyalty_event_id_foreign');
            });
        }
        Schema::dropIfExists('loyalty_event_attendances');
        Schema::dropIfExists('loyalty_event_registrations');
        Schema::dropIfExists('loyalty_event_tiers');
        Schema::dropIfExists('loyalty_events');
    }

    private function hasEventForeignKey(): bool
    {
        foreach (Schema::getForeignKeys('scan_events') as $key) {
            if (($key['name'] ?? null) === 'scan_events_loyalty_event_id_foreign') {
                return true;
            }
        }

        return false;
    }
};
