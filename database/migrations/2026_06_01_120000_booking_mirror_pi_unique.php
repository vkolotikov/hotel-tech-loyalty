<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add the partial unique index on (organization_id, stripe_payment_intent_id) that
 * BookingPublicController orphan-recovery + BookingEngineService confirm idempotency
 * have always claimed to rely on but was never actually shipped.
 *
 * The orphan-recovery branch (BookingPublicController::stripeWebhook) wraps mirror
 * creation in try { ... } catch (UniqueConstraintViolationException) — without this
 * index that catch can never fire and the race produces TWO BookingMirror rows for
 * one PaymentIntent: one from confirm(), one from the webhook orphan recovery.
 *
 * Partial WHERE stripe_payment_intent_id IS NOT NULL: most mirrors created locally
 * before manual capture rolled out have NULL PI; uniqueness must only apply when
 * a real PI is present.
 *
 * Pre-step deletes existing duplicates (keep the oldest by id) so the index can
 * be created on a clean table. Conservative — soft-deletes the later rows by
 * flipping their stripe_payment_intent_id to NULL with an audit-style suffix so
 * the historical row is preserved for forensics, only the FK link to Stripe is cleared.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('booking_mirror')) {
            return;
        }

        // Step 1: defang any existing duplicates so the index can be created.
        // For each (org_id, stripe_payment_intent_id) group with > 1 row, keep
        // the row with the smallest id and clear stripe_payment_intent_id on the
        // others by suffixing the value with a marker. This preserves forensic
        // traceability without breaking the new unique constraint.
        DB::statement(<<<'SQL'
            WITH dupes AS (
                SELECT id,
                       organization_id,
                       stripe_payment_intent_id,
                       ROW_NUMBER() OVER (
                           PARTITION BY organization_id, stripe_payment_intent_id
                           ORDER BY id ASC
                       ) AS rn
                FROM booking_mirror
                WHERE stripe_payment_intent_id IS NOT NULL
            )
            UPDATE booking_mirror bm
            SET stripe_payment_intent_id = bm.stripe_payment_intent_id || '_dup' || bm.id
            FROM dupes
            WHERE bm.id = dupes.id
              AND dupes.rn > 1
        SQL);

        // Step 2: create the partial unique index (idempotent guard).
        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX IF NOT EXISTS booking_mirror_org_pi_unique
                ON booking_mirror (organization_id, stripe_payment_intent_id)
                WHERE stripe_payment_intent_id IS NOT NULL
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS booking_mirror_org_pi_unique');
        // No automatic restore of the suffixed dup rows — manual forensics only.
    }
};
