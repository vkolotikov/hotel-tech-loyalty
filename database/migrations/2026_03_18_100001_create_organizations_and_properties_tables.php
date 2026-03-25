<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Organization / hotel group / chain
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('legal_name')->nullable();
            $table->string('tax_id', 50)->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 20)->nullable();
            $table->text('address')->nullable();
            $table->string('country', 2)->nullable();
            $table->string('currency', 3)->default('USD');
            $table->string('timezone', 50)->default('UTC');
            $table->string('logo_url')->nullable();
            $table->string('website')->nullable();
            $table->json('settings')->nullable(); // org-level overrides
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Individual hotel / property
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 10)->unique(); // short code e.g. "DXB01"
            $table->string('email')->nullable();
            $table->string('phone', 20)->nullable();
            $table->text('address')->nullable();
            $table->string('city', 100)->nullable();
            $table->string('country', 2)->nullable();
            $table->string('timezone', 50)->default('UTC');
            $table->string('currency', 3)->default('USD');
            $table->string('star_rating', 5)->nullable();
            $table->integer('room_count')->nullable();
            $table->string('pms_type', 50)->nullable();   // opera, mews, cloudbeds, etc.
            $table->string('pms_property_id')->nullable(); // external PMS identifier
            $table->json('settings')->nullable(); // property-level overrides
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('organization_id');
            $table->index('code');
        });

        // Outlets / revenue centers (restaurant, spa, bar, etc.)
        Schema::create('outlets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('property_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 20); // "REST01", "SPA01"
            $table->string('type', 30)->default('other');
            $table->decimal('earn_rate_override', 4, 2)->nullable(); // override tier earn rate
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('property_id');
            $table->unique(['property_id', 'code']);
        });

        // Add property_id to existing tables
        Schema::table('staff', function (Blueprint $table) {
            $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
        });

        Schema::table('notification_campaigns', function (Blueprint $table) {
            $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
        });

        Schema::table('special_offers', function (Blueprint $table) {
            $table->foreignId('property_id')->nullable()->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('special_offers', fn(Blueprint $t) => $t->dropConstrainedForeignId('property_id'));
        Schema::table('notification_campaigns', fn(Blueprint $t) => $t->dropConstrainedForeignId('property_id'));
        Schema::table('bookings', fn(Blueprint $t) => $t->dropConstrainedForeignId('property_id'));
        Schema::table('staff', fn(Blueprint $t) => $t->dropConstrainedForeignId('property_id'));
        Schema::dropIfExists('outlets');
        Schema::dropIfExists('properties');
        Schema::dropIfExists('organizations');
    }
};
