<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('knowledge_items', function (Blueprint $table) {
            $table->string('source_key', 100)->nullable();
            $table->timestamp('source_checked_at')->nullable();
            $table->unique(['organization_id', 'brand_id', 'source_key'], 'knowledge_item_brand_source');
        });
    }

    public function down(): void
    {
        Schema::table('knowledge_items', function (Blueprint $table) {
            $table->dropUnique('knowledge_item_brand_source');
            $table->dropColumn(['source_key', 'source_checked_at']);
        });
    }
};
