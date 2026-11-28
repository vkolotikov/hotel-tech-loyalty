<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('loyalty_members', fn (Blueprint $table) => $table->date('membership_valid_from')->nullable());
    }

    public function down(): void
    {
        Schema::table('loyalty_members', fn (Blueprint $table) => $table->dropColumn('membership_valid_from'));
    }
};
