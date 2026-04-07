<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            if (!Schema::hasColumn('chat_conversations', 'visitor_ip'))         $table->string('visitor_ip', 45)->nullable()->after('visitor_phone');
            if (!Schema::hasColumn('chat_conversations', 'visitor_country'))    $table->string('visitor_country', 100)->nullable()->after('visitor_ip');
            if (!Schema::hasColumn('chat_conversations', 'visitor_city'))       $table->string('visitor_city', 100)->nullable()->after('visitor_country');
            if (!Schema::hasColumn('chat_conversations', 'visitor_user_agent')) $table->text('visitor_user_agent')->nullable()->after('visitor_city');
            if (!Schema::hasColumn('chat_conversations', 'page_url'))           $table->text('page_url')->nullable()->after('visitor_user_agent');
            if (!Schema::hasColumn('chat_conversations', 'agent_notes'))        $table->text('agent_notes')->nullable()->after('rating_comment');
        });

        // Add an index on visitor_ip for dedup lookups
        try {
            Schema::table('chat_conversations', function (Blueprint $table) {
                $table->index(['organization_id', 'visitor_ip'], 'chat_conv_org_ip_idx');
            });
        } catch (\Throwable $e) { /* index may already exist */ }

        Schema::create('chat_message_feedback', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('message_id')->constrained('chat_messages')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('rating', 10); // good | bad
            $table->text('comment')->nullable();
            $table->boolean('applied_to_training')->default(false);
            $table->timestamps();

            $table->unique(['message_id', 'user_id'], 'chat_msg_fb_unique');
            $table->index('organization_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_message_feedback');

        Schema::table('chat_conversations', function (Blueprint $table) {
            try { $table->dropIndex('chat_conv_org_ip_idx'); } catch (\Throwable $e) {}
            $table->dropColumn(['visitor_ip', 'visitor_country', 'visitor_city', 'visitor_user_agent', 'page_url', 'agent_notes']);
        });
    }
};
