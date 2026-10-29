<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_verification_codes', function (Blueprint $table) {
            // No FK: deleting an identity must not turn its code into a legacy email-only grant.
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('purpose', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('email_verification_codes', fn (Blueprint $table) => $table->dropColumn(['user_id', 'purpose']));
    }
};
