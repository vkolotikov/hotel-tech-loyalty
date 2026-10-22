<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Loyalty release 3 (spec 2026-10-22 §2, R3-1): the wallet pass files move into the database. Laravel Cloud
 * keeps no local disk between deployments and shares none between replicas, so a certificate kept under
 * `storage/app/wallet/{organisation}/` was lost on every deploy.
 *
 * Each column holds one file's bytes in base64, encrypted by Laravel's `encrypted` cast (App\Models\WalletConfig):
 * the Pass Type ID certificate (.p12), Apple's WWDR certificate, the Google service-account JSON. `longText` is `text`
 * on PostgreSQL. Nullable columns only, nothing rewritten: safe for `migrate --force` on the live database. The path
 * columns stay, unused for new uploads; a file still on the disk is taken into these columns the first time its row is
 * read.
 */
return new class extends Migration
{
    private const COLUMNS = ['apple_cert_content', 'apple_wwdr_content', 'google_service_account_content'];

    public function up(): void
    {
        Schema::table('wallet_configs', function (Blueprint $table) {
            foreach (self::COLUMNS as $column) {
                if (!Schema::hasColumn('wallet_configs', $column)) {
                    $table->longText($column)->nullable();
                }
            }
        });
    }

    public function down(): void
    {
        $present = array_values(array_filter(self::COLUMNS, fn (string $column) => Schema::hasColumn('wallet_configs', $column)));
        if ($present === []) {
            return;
        }
        Schema::table('wallet_configs', function (Blueprint $table) use ($present) {
            $table->dropColumn($present);
        });
    }
};
