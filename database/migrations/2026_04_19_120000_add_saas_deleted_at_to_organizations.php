<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            // Flips to a timestamp when the reconcile job discovers the
            // matching SaaS org has been deleted. Archived orgs are hidden
            // from tenant lookups but kept on disk so support can restore
            // them if a deletion was accidental.
            $table->timestamp('saas_deleted_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn('saas_deleted_at');
        });
    }
};
