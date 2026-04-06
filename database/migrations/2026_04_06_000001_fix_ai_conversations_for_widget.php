<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_conversations', function (Blueprint $table) {
            // Make member_id nullable so widget (anonymous) conversations work
            $table->foreignId('member_id')->nullable()->change();
        });

        // Add organization_id if it doesn't exist (may have been added by multitenancy migration)
        if (!Schema::hasColumn('ai_conversations', 'organization_id')) {
            Schema::table('ai_conversations', function (Blueprint $table) {
                $table->foreignId('organization_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::table('ai_conversations', function (Blueprint $table) {
            $table->foreignId('member_id')->nullable(false)->change();
        });
    }
};
