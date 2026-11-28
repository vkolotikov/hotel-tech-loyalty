<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_promotions', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('organization_id')->index();
            $t->unsignedBigInteger('brand_id')->nullable()->index();
            $t->string('name', 120);
            $t->string('code', 32);
            $t->string('type', 24);
            $t->decimal('value', 12, 2)->default(0);
            $t->string('currency', 3);
            $t->string('status', 16)->default('draft');
            $t->timestampTz('booking_from')->nullable();
            $t->timestampTz('booking_until')->nullable();
            $t->date('stay_from')->nullable();
            $t->date('stay_until')->nullable();
            $t->json('excluded_dates')->nullable();
            $t->json('room_ids')->nullable();
            $t->unsignedSmallInteger('min_nights')->default(1);
            $t->unsignedInteger('revision')->default(1);
            $t->timestampsTz();
            $t->unique(['organization_id', 'code']);
        });
        Schema::create('booking_promotion_uses', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('organization_id')->index();
            $t->unsignedBigInteger('promotion_id')->index();
            $t->unsignedBigInteger('booking_mirror_id')->index();
            $t->string('hold_token', 48);
            $t->string('currency', 3);
            $t->decimal('discount_amount', 12, 2);
            $t->decimal('accommodation_total', 12, 2);
            $t->json('snapshot');
            $t->timestampsTz();
            $t->unique(['organization_id', 'hold_token']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_promotion_uses');
        Schema::dropIfExists('booking_promotions');
    }
};
