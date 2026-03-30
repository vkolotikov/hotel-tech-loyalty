<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('subject');
            $table->text('html_body');
            $table->json('merge_tags')->nullable();   // available tags for this template
            $table->string('category', 50)->default('campaign'); // campaign, transactional, welcome
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Add email support columns to notification_campaigns
        Schema::table('notification_campaigns', function (Blueprint $table) {
            $table->foreignId('email_template_id')->nullable()->after('channel')
                  ->constrained('email_templates')->nullOnDelete();
            $table->string('email_subject')->nullable()->after('email_template_id');
            $table->integer('email_sent_count')->default(0)->after('sent_count');
        });
    }

    public function down(): void
    {
        Schema::table('notification_campaigns', function (Blueprint $table) {
            $table->dropConstrainedForeignId('email_template_id');
            $table->dropColumn(['email_subject', 'email_sent_count']);
        });
        Schema::dropIfExists('email_templates');
    }
};
