<?php

namespace Tests\Concerns\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cashback credit's table and column (release 7, spec 2026-10-25 §3) in sqlite, as migration 2026_10_25_110000 builds
 * them: `loyalty_members.credit_balance` (NOT NULL DEFAULT 0) and `credit_transactions` with its idempotency key unique
 * per organisation. No foreign keys, as the tests' other hand-built tables. Guarded.
 *
 * Called as buildCreditSchema() (Laravel calls setUp<TraitName>() itself, before the base tables exist).
 */
trait CreditSchema
{
    protected function buildCreditSchema(): void
    {
        if (Schema::hasTable('loyalty_members') && !Schema::hasColumn('loyalty_members', 'credit_balance')) {
            Schema::table('loyalty_members', fn (Blueprint $t) => $t->decimal('credit_balance', 12, 2)->default(0));
        }
        if (!Schema::hasTable('credit_transactions')) {
            Schema::create('credit_transactions', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('member_id');
                $t->string('type', 20);
                $t->decimal('amount', 12, 2);
                $t->decimal('balance_after', 12, 2);
                $t->string('currency', 3);
                $t->string('reference_type', 40)->nullable();
                $t->unsignedBigInteger('reference_id')->nullable();
                $t->string('idempotency_key', 120)->nullable();
                $t->string('note', 500)->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'idempotency_key'], 'credit_transactions_org_key_unique');
            });
        }
    }
}
