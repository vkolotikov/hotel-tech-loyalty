<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Member portal phase 3: the member and their discount on a stay, and what a
 * cancellation and a refund leave behind. Every change is additive and
 * guarded so the migration can run on a database that already carries part
 * of it, and it never fails on data it did not expect.
 *
 * No unique index on service_bookings' payment reference here: that index is
 * created by the migration 2026_10_01_100000_service_bookings_unique_payment.
 * The portal's own protection is PortalPaymentIntentGuard::assertUnused()
 * under the `pi:` lock.
 */
return new class extends Migration
{
    private const MIRROR = ['member_id', 'list_total', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at', 'cancelled_at', 'cancellation_reason'];
    private const SERVICE = ['refunded_amount', 'refunded_at', 'last_refund_id'];

    public function up(): void
    {
        $this->addColumns('booking_mirror', function (Blueprint $t, array $has) {
            if (!$has['member_id']) $t->unsignedBigInteger('member_id')->nullable();
            if (!$has['list_total']) $t->decimal('list_total', 12, 2)->nullable();
            if (!$has['discount_amount']) $t->decimal('discount_amount', 12, 2)->default(0);
            if (!$has['discount_source']) $t->string('discount_source', 20)->nullable();
            if (!$has['discount_source_id']) $t->unsignedBigInteger('discount_source_id')->nullable();
            if (!$has['discount_label']) $t->string('discount_label', 120)->nullable();
            if (!$has['points_awarded_at']) $t->timestamp('points_awarded_at')->nullable();
            if (!$has['cancelled_at']) $t->timestamp('cancelled_at')->nullable();
            if (!$has['cancellation_reason']) $t->string('cancellation_reason', 60)->nullable();
        }, self::MIRROR);
        if (Schema::hasTable('booking_mirror') && !$this->hasIndex('booking_mirror', 'booking_mirror_org_member_index')) {
            Schema::table('booking_mirror', fn (Blueprint $t) => $t->index(['organization_id', 'member_id'], 'booking_mirror_org_member_index'));
        }

        $this->addColumns('service_bookings', function (Blueprint $t, array $has) {
            if (!$has['refunded_amount']) $t->decimal('refunded_amount', 10, 2)->nullable();
            if (!$has['refunded_at']) $t->timestamp('refunded_at')->nullable();
            if (!$has['last_refund_id']) $t->string('last_refund_id')->nullable();
        }, self::SERVICE);

        if (Schema::hasTable('member_offers') && Schema::hasColumn('member_offers', 'used_reference')) {
            Schema::table('member_offers', fn (Blueprint $t) => $t->string('used_reference', 60)->nullable()->change());
        }
    }

    public function down(): void
    {
        $this->dropColumns('service_bookings', self::SERVICE);

        if (Schema::hasTable('booking_mirror') && $this->hasIndex('booking_mirror', 'booking_mirror_org_member_index')) {
            Schema::table('booking_mirror', fn (Blueprint $t) => $t->dropIndex('booking_mirror_org_member_index'));
        }
        $this->dropColumns('booking_mirror', self::MIRROR);
        // member_offers.used_reference stays at 60: narrowing it could truncate a reference written since.
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
