<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_rooms', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('pms_id')->nullable()->comment('External ID from Smoobu/Cloudbeds/etc');
            $table->string('name');
            $table->string('slug')->nullable();
            $table->text('description')->nullable();
            $table->text('short_description')->nullable();
            $table->integer('max_guests')->default(2);
            $table->integer('bedrooms')->default(1);
            $table->string('bed_type')->nullable();
            $table->decimal('base_price', 10, 2)->default(0);
            $table->string('currency', 10)->default('EUR');
            $table->string('image')->nullable()->comment('Primary hero image path');
            $table->json('gallery')->nullable()->comment('Array of additional image paths');
            $table->json('amenities')->nullable()->comment('Array of amenity slugs e.g. ["wifi","sauna","kitchen"]');
            $table->json('tags')->nullable()->comment('Array of display tags e.g. ["Forest view","Deluxe"]');
            $table->string('size')->nullable()->comment('e.g. 45m², 80m²');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->json('meta')->nullable()->comment('Extra PMS data or custom fields');
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
            $table->unique(['organization_id', 'pms_id']);
        });

        Schema::create('booking_extras', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 10, 2)->default(0);
            $table->string('price_type')->default('per_stay')->comment('per_stay, per_night, per_person, per_person_night');
            $table->string('currency', 10)->default('EUR');
            $table->string('image')->nullable();
            $table->string('icon')->nullable()->comment('Icon slug e.g. coffee, wine, spa');
            $table->string('category')->nullable()->comment('e.g. food, wellness, transport, activity');
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['organization_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_extras');
        Schema::dropIfExists('booking_rooms');
    }
};
