<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->string('header_text_color', 7)->default('#ffffff')->after('primary_color');
            $table->string('user_bubble_color', 7)->nullable()->after('header_text_color');
            $table->string('user_bubble_text', 7)->default('#ffffff')->after('user_bubble_color');
            $table->string('bot_bubble_color', 7)->nullable()->after('user_bubble_text');
            $table->string('bot_bubble_text', 7)->default('#1f2937')->after('bot_bubble_color');
            $table->string('chat_bg_color', 7)->default('#ffffff')->after('bot_bubble_text');
            $table->string('font_family', 60)->default('Inter')->after('chat_bg_color');
            $table->unsignedTinyInteger('border_radius')->default(16)->after('font_family');
            $table->boolean('show_branding')->default(true)->after('border_radius');
            $table->string('header_style', 20)->default('solid')->after('show_branding'); // solid, gradient
            $table->string('header_gradient_end', 7)->nullable()->after('header_style');
            $table->unsignedSmallInteger('launcher_size')->default(56)->after('header_gradient_end');
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn([
                'header_text_color', 'user_bubble_color', 'user_bubble_text',
                'bot_bubble_color', 'bot_bubble_text', 'chat_bg_color',
                'font_family', 'border_radius', 'show_branding',
                'header_style', 'header_gradient_end', 'launcher_size',
            ]);
        });
    }
};
