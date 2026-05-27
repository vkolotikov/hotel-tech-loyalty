<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('booking_mirror', function (Blueprint $table) {
            $table->string('booking_group_id', 36)->nullable()->after('organization_id');
            $table->index(['organization_id', 'booking_group_id']);
        });
    }

    public function down(): void
    {
        Schema::table('booking_mirror', function (Blueprint $table) {
            $table->dropIndex(['organization_id', 'booking_group_id']);
            $table->dropColumn('booking_group_id');
        });
    }
};
