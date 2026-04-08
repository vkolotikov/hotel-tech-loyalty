<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cache the entitlements that come back from the SaaS BootstrapController on
 * the local organizations row. This lets feature checks happen synchronously
 * without hitting the SaaS backend on every API call.
 *
 * The middleware refreshes these columns whenever they are older than 5
 * minutes, so a plan upgrade in the SaaS panel propagates within that window.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('plan_slug', 50)->nullable()->after('saas_org_id');
            $table->string('subscription_status', 30)->nullable()->after('plan_slug');
            $table->jsonb('entitled_products')->nullable()->after('subscription_status');
            $table->jsonb('plan_features')->nullable()->after('entitled_products');
            $table->timestamp('entitlements_synced_at')->nullable()->after('plan_features');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn([
                'plan_slug',
                'subscription_status',
                'entitled_products',
                'plan_features',
                'entitlements_synced_at',
            ]);
        });
    }
};
