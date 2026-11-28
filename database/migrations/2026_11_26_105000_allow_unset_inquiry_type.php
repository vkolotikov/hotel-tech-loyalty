<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inquiries', fn (Blueprint $table) => $table->string('inquiry_type', 50)->nullable()->default('Room Reservation')->change());
    }

    public function down(): void
    {
        DB::table('inquiries')->whereNull('inquiry_type')->update(['inquiry_type' => 'General']);
        Schema::table('inquiries', fn (Blueprint $table) => $table->string('inquiry_type', 50)->default('Room Reservation')->change());
    }
};
