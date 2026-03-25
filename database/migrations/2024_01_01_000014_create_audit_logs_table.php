<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 100)->nullable(); // model class
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('action', 100); // login, award_points, issue_nfc, etc.
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('causer_type', 100)->nullable(); // User or Staff
            $table->unsignedBigInteger('causer_id')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
            $table->index(['causer_type', 'causer_id']);
            $table->index('action');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
