<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_widget_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->uuid('widget_key')->unique();
            $table->string('api_key', 64)->unique();
            $table->string('company_name', 180)->default('');
            $table->text('welcome_message')->nullable();
            $table->string('primary_color', 7)->default('#c9a84c');
            $table->string('position', 20)->default('bottom-right');
            $table->string('icon_style', 30)->default('classic');
            $table->string('launcher_shape', 20)->default('circle');
            $table->string('launcher_icon', 20)->default('chat');
            $table->boolean('lead_capture_enabled')->default(true);
            $table->jsonb('lead_capture_fields')->nullable(); // {name: true, email: true, phone: false}
            $table->unsignedInteger('lead_capture_delay')->default(0); // seconds before showing lead form
            $table->text('offline_message')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('organization_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_widget_configs');
    }
};
