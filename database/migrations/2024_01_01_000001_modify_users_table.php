<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('phone', 20)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('nationality', 100)->nullable();
            $table->string('language', 10)->default('en');
            $table->string('avatar_url')->nullable();
            $table->string('user_type', 20)->default('member');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['phone', 'date_of_birth', 'nationality', 'language', 'avatar_url', 'user_type']);
        });
    }
};
