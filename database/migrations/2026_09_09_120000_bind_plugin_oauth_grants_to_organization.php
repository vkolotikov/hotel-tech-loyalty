<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['oauth_auth_codes', 'oauth_access_tokens'] as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->unsignedBigInteger('plugin_organization_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        foreach (['oauth_auth_codes', 'oauth_access_tokens'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropColumn('plugin_organization_id'));
        }
    }

    public function getConnection(): ?string
    {
        return $this->connection ?? config('passport.connection');
    }
};
