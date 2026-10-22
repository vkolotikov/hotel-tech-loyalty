<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The tables Card & app (release 2 §7) reads and writes beyond SetsUpLoyaltyWorkspace's: `wallet_configs` as its
 * migration builds it (the colour defaults included, since the full admin's answers show them), with release 3's file
 * contents (§2). `hotel_settings`,
 * `rewards.image_url` and `special_offers.image_url` are already in the shared set.
 */
trait AppSchema
{
    protected function setUpAppSchema(): void
    {
        if (!Schema::hasTable('wallet_configs')) {
            Schema::create('wallet_configs', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->unique();
                $t->string('apple_pass_type_id', 191)->nullable();
                $t->string('apple_team_id', 32)->nullable();
                $t->string('apple_organization_name', 191)->nullable();
                $t->string('apple_cert_path', 500)->nullable();
                $t->text('apple_cert_password')->nullable();
                $t->string('apple_wwdr_path', 500)->nullable();
                $t->string('apple_pass_background_color', 32)->default('rgb(13,13,13)');
                $t->string('apple_pass_foreground_color', 32)->default('rgb(255,255,255)');
                $t->string('apple_pass_label_color', 32)->default('rgb(201,168,76)');
                $t->string('google_issuer_id', 64)->nullable();
                $t->string('google_class_suffix', 191)->nullable();
                $t->string('google_service_account_path', 500)->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        // Release 3 §2: the three files' contents, encrypted (2026_10_22_100000).
        foreach (['apple_cert_content', 'apple_wwdr_content', 'google_service_account_content'] as $column) {
            if (!Schema::hasColumn('wallet_configs', $column)) {
                Schema::table('wallet_configs', fn (Blueprint $t) => $t->longText($column)->nullable());
            }
        }
    }

    /** The plan holds wallet passes (`feature:wallet`); the subscription is already active (MakesAdminCaller). */
    protected function withWalletFeature(bool $on = true): void
    {
        $this->org->forceFill(['plan_features' => $on ? ['wallet' => true, 'campaigns' => true] : ['campaigns' => true]])->save();
    }
}
