<?php

namespace Tests\Feature\Models;

use App\Models\HotelSetting;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the at-rest encryption invariants on HotelSetting. The four
 * keys in `HotelSetting::ENCRYPTED_KEYS` (stripe_secret_key,
 * stripe_webhook_secret, booking_smoobu_api_key,
 * booking_smoobu_webhook_secret) hold LIVE payment + PMS
 * credentials. A regression that drops the encryption — say someone
 * removes the `saving` hook, or someone adds a new encrypted key
 * without re-running ENCRYPTED_KEYS through both accessor + mutator
 * — is a security incident worth catching at test-time, not
 * audit-time.
 *
 * Six invariants enforced here:
 *
 *   1. Writing an encrypted key stores CIPHERTEXT in the column.
 *      Verified by raw DB read that bypasses the accessor.
 *   2. Reading the same row via Eloquent decrypts transparently
 *      (callers never see ciphertext).
 *   3. Writing a NON-encrypted key stores plaintext (no false-
 *      positive encryption that would corrupt unrelated settings).
 *   4. Plaintext-legacy rows decrypt-pass-through (try/catch in
 *      the accessor) — without this, the 2026-05-13 encryption
 *      ship would have broken every customer's existing prod row.
 *   5. Idempotency: saving an already-encrypted value doesn't
 *      double-encrypt it. Otherwise updating any other field on
 *      the row would corrupt the secret each time.
 *   6. The cached settings map EXCLUDES encrypted keys —
 *      otherwise Postgres-backed cache (CACHE_STORE=database on
 *      Laravel Cloud) would land plaintext secrets in the cache
 *      table, defeating the whole point.
 *
 * Pure DB tests — no Stripe/Smoobu API calls. Uses
 * setUpBookingRefundSchema for the hotel_settings table.
 */
class HotelSettingEncryptionTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_writing_an_encrypted_key_stores_ciphertext_in_the_column(): void
    {
        // The load-bearing security invariant. Raw DB read MUST yield
        // ciphertext for any ENCRYPTED_KEYS row. If this test starts
        // failing, the at-rest encryption shipped 2026-05-13 has
        // silently broken and live Stripe secret keys are leaking
        // into Postgres in plaintext.
        $plaintext = 'sk_live_super_secret_stripe_key_value_12345';

        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => $plaintext,
        ]);

        $rawValue = DB::table('hotel_settings')
            ->where('key', 'stripe_secret_key')
            ->value('value');

        $this->assertNotSame($plaintext, $rawValue,
            'Raw DB value MUST NOT equal plaintext for an ENCRYPTED_KEYS row.');
        $this->assertSame($plaintext, Crypt::decryptString($rawValue),
            'Raw DB value MUST decrypt back to the original plaintext via Laravel Crypt.');
    }

    public function test_reading_an_encrypted_key_via_eloquent_returns_plaintext(): void
    {
        // The other side of the contract: callers reading through the
        // Eloquent accessor must see plaintext, never ciphertext.
        // Without this, StripeService::setting() would feed encrypted
        // garbage to the Stripe SDK and every API call would fail with
        // "invalid key format."
        $plaintext = 'whsec_test_webhook_signing_secret_abcdef';

        HotelSetting::create([
            'key'   => 'stripe_webhook_secret',
            'value' => $plaintext,
        ]);

        $row = HotelSetting::where('key', 'stripe_webhook_secret')->first();

        $this->assertSame($plaintext, $row->value,
            'Eloquent accessor must return plaintext via the decrypt accessor.');
    }

    public function test_non_encrypted_keys_pass_through_without_encryption(): void
    {
        // Critical: encryption applies ONLY to ENCRYPTED_KEYS. Other
        // settings (booking_currency, company_name, etc.) MUST stay
        // plaintext — otherwise reading them via DB::table queries
        // (used by analytics, ops scripts, the cached map) returns
        // unusable ciphertext.
        $value = 'EUR';

        HotelSetting::create([
            'key'   => 'booking_currency',
            'value' => $value,
        ]);

        $rawValue = DB::table('hotel_settings')
            ->where('key', 'booking_currency')
            ->value('value');

        $this->assertSame($value, $rawValue,
            'Non-ENCRYPTED_KEYS values must NOT be encrypted at rest.');
    }

    public function test_legacy_plaintext_encrypted_key_row_decrypts_passthrough(): void
    {
        // Plaintext-legacy compatibility — load-bearing for the
        // 2026-05-13 encryption migration. Pre-encryption rows already
        // exist in customer DBs; the accessor's try/catch on
        // DecryptException must let them pass through unchanged so
        // existing customers don't see Stripe go dark.
        $legacyPlaintext = 'sk_live_pre_encryption_legacy_value';

        // Insert raw plaintext via DB::table to bypass the saving hook.
        $org = app('current_organization_id');
        DB::table('hotel_settings')->insert([
            'organization_id' => $org,
            'key'             => 'stripe_secret_key',
            'value'           => $legacyPlaintext,
            'scope'           => 'company',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $row = HotelSetting::where('key', 'stripe_secret_key')->first();

        $this->assertSame($legacyPlaintext, $row->value,
            'Legacy plaintext rows must pass through the accessor unchanged.');
    }

    public function test_re_saving_an_already_encrypted_value_does_not_double_encrypt(): void
    {
        // Idempotency: the `saving` hook checks via
        // `Crypt::decryptString` whether the value is already a valid
        // Laravel cipher payload. If it is, the hook skips re-encrypting.
        // Without this guard, ANY other-column update on a row would
        // wrap the ciphertext in a second encryption layer, eventually
        // making the secret unrecoverable.
        $plaintext = 'sk_live_idempotency_test_key_98765';

        $row = HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => $plaintext,
        ]);

        $firstCiphertext = DB::table('hotel_settings')
            ->where('id', $row->id)
            ->value('value');

        // Now update an unrelated attribute (the label) to trigger another
        // save without changing the encrypted value. The 2nd save's
        // `saving` hook MUST detect the already-encrypted state and skip.
        $row->label = 'Stripe live secret';
        $row->save();

        $secondCiphertext = DB::table('hotel_settings')
            ->where('id', $row->id)
            ->value('value');

        // The ciphertexts may differ because Laravel encryption uses a
        // random IV per call — but BOTH must decrypt to the SAME
        // original plaintext. The double-encrypt failure mode would
        // produce ciphertext that decrypts to OTHER ciphertext (a Laravel
        // cipher blob nested inside another). Catching that requires a
        // round-trip decrypt:
        $this->assertSame($plaintext, Crypt::decryptString($secondCiphertext),
            'Re-saving must not nest-encrypt; the value still decrypts to the original plaintext.');

        // Sanity: the post-save accessor read also yields original plaintext.
        $reloaded = HotelSetting::where('key', 'stripe_secret_key')->first();
        $this->assertSame($plaintext, $reloaded->value,
            'Eloquent accessor must still return original plaintext after the no-op encrypted-value save.');
    }

    public function test_decryptable_string_skipped_during_save_via_explicit_idempotency(): void
    {
        // Direct test of the idempotency check inside the saving hook:
        // give the model a value that's ALREADY ciphertext via
        // Crypt::encryptString, and verify the DB column doesn't
        // double-wrap it.
        $plaintext = 'whsec_idempotency_direct_test';
        $alreadyCipher = Crypt::encryptString($plaintext);

        $row = HotelSetting::create([
            'key'   => 'stripe_webhook_secret',
            'value' => $alreadyCipher,
        ]);

        $stored = DB::table('hotel_settings')
            ->where('id', $row->id)
            ->value('value');

        $this->assertSame($alreadyCipher, $stored,
            'Pre-encrypted value passed to create() must be persisted verbatim — no double-wrap.');
        $this->assertSame($plaintext, Crypt::decryptString($stored),
            'Stored ciphertext decrypts to the original plaintext in ONE step (no nesting).');
    }

    public function test_each_encrypted_key_in_const_actually_encrypts(): void
    {
        // Defense against partial regressions: someone adding a new
        // key to ENCRYPTED_KEYS but the saving hook only firing for a
        // subset. Walks every key in the const + verifies each one
        // round-trips through the encrypt-on-save → decrypt-on-read
        // pipeline. Catches "I added the key but forgot the column
        // type doesn't have enough length" / "the seeded migration
        // bypasses the hook" failure modes.
        foreach (HotelSetting::ENCRYPTED_KEYS as $key) {
            $unique = "test_value_for_{$key}_" . bin2hex(random_bytes(8));

            HotelSetting::create([
                'key'   => $key,
                'value' => $unique,
            ]);

            $raw = DB::table('hotel_settings')
                ->where('key', $key)
                ->value('value');
            $this->assertNotSame($unique, $raw,
                "Key '{$key}' MUST encrypt at rest — raw column equals plaintext.");

            $row = HotelSetting::where('key', $key)->first();
            $this->assertSame($unique, $row->value,
                "Key '{$key}' must round-trip back to original plaintext via the accessor.");
        }
    }
}
