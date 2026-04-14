<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            if (!Schema::hasColumn('chat_widget_configs', 'widget_template')) {
                $table->string('widget_template', 40)->default('classic')->after('primary_color');
            }
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            if (Schema::hasColumn('chat_widget_configs', 'widget_template')) {
                $table->dropColumn('widget_template');
            }
        });
    }
};
