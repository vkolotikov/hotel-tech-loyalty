<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Member portal phase 2: coupons on offers, typed discounts on rewards, a
 * booking scope on every discount source, and the persisted discount on a
 * service booking. Every change is additive and guarded so the migration
 * can run on a database that already carries part of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->addColumns('special_offers', function (Blueprint $t, array $has) {
            if (!$has['code']) $t->string('code', 24)->nullable()->after('value');
            if (!$has['applies_to']) $t->string('applies_to', 12)->default('all')->after('code');
        }, ['code', 'applies_to']);
        if (Schema::hasColumn('special_offers', 'organization_id') && !$this->hasIndex('special_offers', 'special_offers_org_code_unique')) {
            Schema::table('special_offers', fn (Blueprint $t) => $t->unique(['organization_id', 'code'], 'special_offers_org_code_unique'));
        }

        $this->addColumns('member_offers', function (Blueprint $t, array $has) {
            if (!$has['used_reference']) $t->string('used_reference', 32)->nullable()->after('used_at');
        }, ['used_reference']);

        $this->addColumns('rewards', function (Blueprint $t, array $has) {
            if (!$has['discount_type']) $t->string('discount_type', 20)->nullable();
            if (!$has['discount_value']) $t->decimal('discount_value', 10, 2)->nullable();
            if (!$has['applies_to']) $t->string('applies_to', 12)->default('all');
        }, ['discount_type', 'discount_value', 'applies_to']);

        $this->addColumns('tier_benefits', function (Blueprint $t, array $has) {
            if (!$has['applies_to']) $t->string('applies_to', 12)->default('all');
        }, ['applies_to']);

        $this->addColumns('service_bookings', function (Blueprint $t, array $has) {
            if (!$has['list_amount']) $t->decimal('list_amount', 10, 2)->nullable();
            if (!$has['discount_amount']) $t->decimal('discount_amount', 10, 2)->default(0);
            if (!$has['discount_source']) $t->string('discount_source', 20)->nullable();
            if (!$has['discount_source_id']) $t->unsignedBigInteger('discount_source_id')->nullable();
            if (!$has['discount_label']) $t->string('discount_label', 120)->nullable();
            if (!$has['points_awarded_at']) $t->timestamp('points_awarded_at')->nullable();
        }, ['list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at']);
    }

    public function down(): void
    {
        if (Schema::hasTable('special_offers')) {
            if ($this->hasIndex('special_offers', 'special_offers_org_code_unique')) {
                Schema::table('special_offers', fn (Blueprint $t) => $t->dropUnique('special_offers_org_code_unique'));
            }
            $this->dropColumns('special_offers', ['code', 'applies_to']);
        }
        $this->dropColumns('member_offers', ['used_reference']);
        $this->dropColumns('rewards', ['discount_type', 'discount_value', 'applies_to']);
        $this->dropColumns('tier_benefits', ['applies_to']);
        $this->dropColumns('service_bookings', ['list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at']);
    }

    /** @param string[] $cols */
    private function addColumns(string $table, callable $define, array $cols): void
    {
        if (!Schema::hasTable($table)) return;
        $has = [];
        foreach ($cols as $c) $has[$c] = Schema::hasColumn($table, $c);
        if (!in_array(false, $has, true)) return;
        Schema::table($table, fn (Blueprint $t) => $define($t, $has));
    }

    /** @param string[] $cols */
    private function dropColumns(string $table, array $cols): void
    {
        if (!Schema::hasTable($table)) return;
        $present = array_values(array_filter($cols, fn ($c) => Schema::hasColumn($table, $c)));
        if ($present === []) return;
        Schema::table($table, fn (Blueprint $t) => $t->dropColumn($present));
    }

    private function hasIndex(string $table, string $index): bool
    {
        return collect(Schema::getIndexes($table))->contains(fn ($i) => ($i['name'] ?? null) === $index);
    }
};
