<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Earn-rate bonus events — "Double points weekend" / "Triple points
 * on weekday stays" / "5x on dining at Outlet 3" without touching
 * the per-tier earn_rate config.
 *
 * Active when:
 *  - now() is between starts_at and ends_at
 *  - is_active = true
 *  - (optional) today's day-of-week matches days_of_week (jsonb int array, 0=Sun..6=Sat)
 *  - (optional) member's tier_id is in tier_ids
 *  - (optional) property_id matches the redemption context
 *
 * LoyaltyService::calculateEarnedPoints applies the highest matching
 * multiplier (1.0 = no boost). Composable multiplier-stacking would
 * be nicer but a single highest-matcher avoids surprise 8x results.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('earn_rate_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $t->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name', 120);
            $t->text('description')->nullable();
            $t->decimal('multiplier', 5, 2); // 2.00 = double, 1.50 = 1.5x
            $t->timestamp('starts_at');
            $t->timestamp('ends_at');
            $t->jsonb('days_of_week')->nullable(); // [0,6] = Sun + Sat
            $t->jsonb('tier_ids')->nullable();
            $t->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
            $t->boolean('is_active')->default(true);
            $t->timestamps();

            $t->index(['organization_id', 'is_active', 'starts_at', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('earn_rate_events');
    }
};
