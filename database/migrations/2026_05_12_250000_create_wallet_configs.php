<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Apple Wallet + Google Wallet pass configuration, per organisation.
 *
 * Cert files are stored under storage/app/wallet/{org_id}/ on the
 * PRIVATE disk so they're never served publicly. The .p12 password
 * column is Laravel-encrypted on write via the model accessor.
 *
 * One row per org — admins can flip is_active to temporarily
 * disable Wallet without losing their config.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wallet_configs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('organization_id')->unique()->constrained()->cascadeOnDelete();

            // Apple Wallet
            $t->string('apple_pass_type_id', 191)->nullable();
            $t->string('apple_team_id', 32)->nullable();
            $t->string('apple_organization_name', 191)->nullable();
            $t->string('apple_cert_path', 500)->nullable();
            $t->text('apple_cert_password')->nullable(); // Laravel-encrypted
            $t->string('apple_wwdr_path', 500)->nullable();
            $t->string('apple_pass_background_color', 32)->default('rgb(13,13,13)');
            $t->string('apple_pass_foreground_color', 32)->default('rgb(255,255,255)');
            $t->string('apple_pass_label_color', 32)->default('rgb(201,168,76)');

            // Google Wallet
            $t->string('google_issuer_id', 64)->nullable();
            $t->string('google_class_suffix', 191)->nullable();
            $t->string('google_service_account_path', 500)->nullable();

            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wallet_configs');
    }
};
