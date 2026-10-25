<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cashback credit (HexaTech Loyalty release 7, spec 2026-10-25 §3): a member's credit balance and its ledger. Written
 * only by App\Services\Loyalty\Credit\CreditLedger, every line under the member row lock with the balance after it.
 *
 * - `loyalty_members.credit_balance`: decimal(12,2) NOT NULL DEFAULT 0 — a constant default, so on PostgreSQL 11 and
 *   later a catalogue change only (no table rewrite); every member reads 0.
 * - `credit_transactions`: earn / spend / reverse / adjust, signed amounts, the balance after each, the venue's currency,
 *   what it was for, and an idempotency key unique per organisation.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('loyalty_members', 'credit_balance')) {
            Schema::table('loyalty_members', fn (Blueprint $t) => $t->decimal('credit_balance', 12, 2)->default(0));
        }

        if (!Schema::hasTable('credit_transactions')) {
            Schema::create('credit_transactions', function (Blueprint $t) {
                $t->id();
                $t->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $t->foreignId('member_id')->constrained('loyalty_members')->cascadeOnDelete();
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
                $t->index(['member_id', 'id']);
                $t->index(['organization_id', 'reference_type', 'reference_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_transactions');
        if (Schema::hasColumn('loyalty_members', 'credit_balance')) {
            Schema::table('loyalty_members', fn (Blueprint $t) => $t->dropColumn('credit_balance'));
        }
    }
};
