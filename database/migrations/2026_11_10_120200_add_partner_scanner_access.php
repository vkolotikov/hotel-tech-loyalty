<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('staff', function (Blueprint $table) {
            $table->boolean('loyalty_scan_only')->default(false);
            $table->json('loyalty_place_ids')->nullable();
        });
    }
    public function down(): void {
        Schema::table('staff', fn (Blueprint $table) => $table->dropColumn(['loyalty_scan_only', 'loyalty_place_ids']));
    }
};
