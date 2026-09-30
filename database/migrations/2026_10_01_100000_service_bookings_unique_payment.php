<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * One payment pays for one service booking, as a database rule: a partial
 * unique index on service_bookings (organization_id, stripe_payment_intent_id)
 * that leaves out rows with no payment (NULL or the empty string). It binds
 * every writer of the column — the member portal's confirm, which also checks
 * under the `pi:` lock (PortalPaymentIntentGuard::assertUnused()), and the
 * public services confirm, which checks before its insert and answers a
 * violation of this index in plain words.
 *
 * Guarded, and never fails a deploy on data it did not expect. When the table
 * already holds a repeated non-empty reference within one organisation, the
 * index is NOT created, nothing is edited, and a warning names the
 * organisations (at most 20) and how many repeated references the scan found
 * (at most 20): a payment reference is what the capture job and a refund look
 * a booking up by, so which booking keeps it is a person's decision. A CREATE
 * that fails anyway (a repeat written between the scan and the statement,
 * say) is rolled back to its own savepoint and logged as a warning. Without
 * the index, the public confirm's own check before its insert still refuses a
 * reused payment. Reversible.
 */
return new class extends Migration
{
    private const INDEX = 'service_bookings_org_pi_unique';

    public function up(): void
    {
        if (!Schema::hasTable('service_bookings') || !Schema::hasColumn('service_bookings', 'stripe_payment_intent_id')) return;
        if ($this->hasIndex('service_bookings', self::INDEX)) return;

        $duplicates = DB::table('service_bookings')
            ->select('organization_id', 'stripe_payment_intent_id')
            ->whereNotNull('stripe_payment_intent_id')
            ->where('stripe_payment_intent_id', '<>', '')
            ->groupBy('organization_id', 'stripe_payment_intent_id')
            ->havingRaw('COUNT(*) > 1')
            ->limit(20)
            ->get();
        if ($duplicates->isNotEmpty()) {
            Log::warning('service_bookings_unique_payment: service_bookings holds repeated payment references; the unique index was not created', [
                'organizations' => $duplicates->pluck('organization_id')->unique()->values()->all(),
                'count' => $duplicates->count(),
            ]);
            return;
        }

        try {
            // Its own savepoint inside the migration's transaction: on
            // PostgreSQL a failed statement would otherwise abort that
            // transaction, and with it the deploy.
            DB::transaction(fn () => DB::statement('CREATE UNIQUE INDEX ' . self::INDEX . " ON service_bookings (organization_id, stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id <> ''"));
        } catch (\Throwable $e) {
            Log::warning('service_bookings_unique_payment: creating the unique index failed; the unique index was not created', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('service_bookings') && $this->hasIndex('service_bookings', self::INDEX)) {
            DB::statement('DROP INDEX ' . self::INDEX);
        }
    }

    private function hasIndex(string $table, string $index): bool
    {
        return collect(Schema::getIndexes($table))->contains(fn ($i) => ($i['name'] ?? null) === $index);
    }
};
