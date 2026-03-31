<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replace single-column unique constraints with composite (organization_id, column)
 * so each tenant can have their own Bronze tier, hotel_name setting, etc.
 */
return new class extends Migration
{
    public function up(): void
    {
        // loyalty_tiers: name → (organization_id, name)
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->dropUnique(['name']);
            $table->unique(['organization_id', 'name']);
        });

        // hotel_settings: key → (organization_id, key)
        Schema::table('hotel_settings', function (Blueprint $table) {
            $table->dropUnique(['key']);
            $table->unique(['organization_id', 'key']);
        });

        // properties: code → (organization_id, code)
        Schema::table('properties', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->unique(['organization_id', 'code']);
        });

        // benefit_definitions: code → (organization_id, code)
        if (Schema::hasColumn('benefit_definitions', 'code')) {
            Schema::table('benefit_definitions', function (Blueprint $table) {
                $table->dropUnique(['code']);
                $table->unique(['organization_id', 'code']);
            });
        }

        // venues: name → (organization_id, name)
        if (Schema::hasTable('venues')) {
            Schema::table('venues', function (Blueprint $table) {
                $table->dropUnique(['name']);
                $table->unique(['organization_id', 'name']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('loyalty_tiers', function (Blueprint $table) {
            $table->dropUnique(['organization_id', 'name']);
            $table->unique('name');
        });

        Schema::table('hotel_settings', function (Blueprint $table) {
            $table->dropUnique(['organization_id', 'key']);
            $table->unique('key');
        });

        Schema::table('properties', function (Blueprint $table) {
            $table->dropUnique(['organization_id', 'code']);
            $table->unique('code');
        });

        if (Schema::hasColumn('benefit_definitions', 'code')) {
            Schema::table('benefit_definitions', function (Blueprint $table) {
                $table->dropUnique(['organization_id', 'code']);
                $table->unique('code');
            });
        }

        if (Schema::hasTable('venues')) {
            Schema::table('venues', function (Blueprint $table) {
                $table->dropUnique(['organization_id', 'name']);
                $table->unique('name');
            });
        }
    }
};
