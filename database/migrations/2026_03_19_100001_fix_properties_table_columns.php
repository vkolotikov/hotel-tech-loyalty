<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            // Widen country from varchar(2) to varchar(100) to accept full country names
            $table->string('country', 100)->nullable()->change();
            // Widen code from varchar(10) to varchar(20) to accept longer codes
            $table->string('code', 20)->change();
            // Make organization_id nullable so properties can be created without one
            $table->foreignId('organization_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            $table->string('country', 2)->nullable()->change();
            $table->string('code', 10)->change();
            $table->foreignId('organization_id')->nullable(false)->change();
        });
    }
};
