<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->string('window_style', 20)->default('panel')->after('header_gradient_end');
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn('window_style');
        });
    }
};
