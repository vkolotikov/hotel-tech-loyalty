<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('member_id')->nullable()->constrained('loyalty_members')->nullOnDelete();
            $table->string('visitor_name', 120)->nullable();
            $table->string('visitor_email', 180)->nullable();
            $table->string('visitor_phone', 30)->nullable();
            $table->string('channel', 20)->default('widget'); // widget, web, mobile
            $table->string('status', 20)->default('active');  // active, waiting, resolved, archived
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->smallInteger('rating')->nullable();
            $table->text('rating_comment')->nullable();
            $table->boolean('lead_captured')->default(false);
            $table->foreignId('inquiry_id')->nullable()->constrained('inquiries')->nullOnDelete();
            $table->string('session_id', 64)->nullable()->unique();
            $table->unsignedInteger('messages_count')->default(0);
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();

            $table->index('organization_id');
            $table->index('status');
            $table->index('assigned_to');
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained('chat_conversations')->cascadeOnDelete();
            $table->string('sender_type', 20); // visitor, ai, agent, system
            $table->foreignId('sender_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('content');
            $table->string('content_type', 30)->default('text'); // text, html, image, file
            $table->boolean('is_read')->default(false);
            $table->jsonb('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('conversation_id');
            $table->index('sender_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('chat_conversations');
    }
};
