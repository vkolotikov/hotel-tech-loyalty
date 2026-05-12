<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Self-serve redemption catalog.
 *
 * Two tables:
 *
 *  - `rewards` — the catalog. Org-scoped (loyalty programs span all
 *    brands of an org by default, but brand_id is nullable for
 *    sub-brand-specific items). Optional stock for limited inventory
 *    items (room upgrades, capped-supply experiences); null = unlimited.
 *
 *  - `reward_redemptions` — a ledger of who claimed what. Status
 *    transitions: pending → fulfilled (delivered) or pending →
 *    cancelled (refunded). Carries a short human-friendly `code`
 *    members show staff at pickup. Points-spent is denormalised on
 *    the row because the reward's points_cost may change after the
 *    redemption — we want the historical record to reflect what was
 *    actually charged.
 *
 *  Unique index on (organization_id, code) so a fresh redemption
 *  can't collide; rare collisions in the controller's random-code
 *  generator just retry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rewards', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name', 191);
            $t->text('description')->nullable();
            $t->text('terms')->nullable();
            $t->string('image_url', 500)->nullable();
            // free-form so admins can pick their own taxonomy
            // (Stay / Dining / Spa / Experience / Merchandise / …).
            $t->string('category', 60)->nullable();
            $t->unsignedInteger('points_cost');
            // null = unlimited supply. When set, decremented on redeem.
            $t->unsignedInteger('stock')->nullable();
            $t->unsignedInteger('per_member_limit')->nullable(); // null = unlimited per member
            $t->timestamp('expires_at')->nullable();
            $t->boolean('is_active')->default(true);
            $t->unsignedInteger('sort_order')->default(0);
            $t->timestamps();

            $t->index(['organization_id', 'is_active']);
            $t->index(['organization_id', 'sort_order']);
        });

        Schema::create('reward_redemptions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
            $t->foreignId('reward_id')->constrained('rewards')->cascadeOnDelete();
            // staff who marked fulfilled / cancelled. References `users`
            // (staff are users with user_type='staff') rather than `staff`
            // so historical attribution survives a staff-row delete.
            $t->foreignId('fulfilled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('cancelled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            // Denormalised so reward-edit doesn't rewrite history.
            $t->unsignedInteger('points_spent');
            $t->string('code', 16);
            $t->string('status', 16)->default('pending'); // pending | fulfilled | cancelled
            $t->text('notes')->nullable();
            $t->timestamp('fulfilled_at')->nullable();
            $t->timestamp('cancelled_at')->nullable();
            $t->timestamps();

            $t->unique(['organization_id', 'code']);
            $t->index(['organization_id', 'member_id']);
            $t->index(['organization_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reward_redemptions');
        Schema::dropIfExists('rewards');
    }
};
