<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Configurable copy/text for the chat widget so admins can edit the
 * header title, subtitle, welcome heading, suggestion buttons, etc.
 * without touching the JS.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->string('header_title', 80)->nullable()->after('company_name');
            $table->string('header_subtitle', 120)->nullable()->after('header_title');
            $table->string('welcome_title', 120)->nullable()->after('welcome_message');
            $table->text('welcome_subtitle')->nullable()->after('welcome_title');
            $table->string('input_placeholder', 120)->nullable()->after('welcome_subtitle');
            $table->boolean('show_suggestions')->default(true)->after('input_placeholder');
            $table->jsonb('suggestions')->nullable()->after('show_suggestions');
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn([
                'header_title', 'header_subtitle', 'welcome_title',
                'welcome_subtitle', 'input_placeholder', 'show_suggestions', 'suggestions',
            ]);
        });
    }
};
