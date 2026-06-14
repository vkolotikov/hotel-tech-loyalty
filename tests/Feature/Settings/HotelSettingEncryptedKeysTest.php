<?php

namespace Tests\Feature\Settings;

use App\Models\HotelSetting;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the at-rest encryption contract for credential-bearing
 * HotelSetting rows. May 13 2026 ship rationale:
 *
 *   - hotel_settings is a multi-tenant key/value store. The
 *     `value` column for Stripe + Smoobu secrets MUST land in
 *     Postgres as ciphertext (Laravel Crypt payload). A
 *     plaintext leak from a DB snapshot, a misconfigured backup,
 *     or a tenant SQL audit query exposes EVERY org's Stripe
 *     secret key (this is a customer portal — each org has its
 *     own real money-moving credential)
 *   - Callers reading `->value` MUST get plaintext transparently
 *     so existing code doesn't have to know about the encryption
 *   - Legacy plaintext rows MUST pass through unchanged on read
 *     (no exceptions to break old-code-paths), and re-encrypt
 *     on next save (so the migration converges naturally)
 *
 * The four keys today:
 *   - stripe_secret_key, stripe_webhook_secret
 *   - booking_smoobu_api_key, booking_smoobu_webhook_secret
 *
 * Cache exclusion invariant: ENCRYPTED_KEYS entries MUST NOT
 * land in the cachedMapFor(orgId) array. Under
 * CACHE_STORE=database (Laravel Cloud default) that cached
 * payload lands in Postgres as plaintext — defeating at-rest
 * encryption. cachedMapFor must reject those keys.
 *
 * NEVER read `hotel_settings.value` via ->value('value') for
 * ENCRYPTED_KEYS — that bypasses the accessor and returns
 * ciphertext. Use ->first() + $row->value. CLAUDE.md flags
 * this as a known footgun.
 */
class HotelSettingEncryptedKeysTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema(); // includes hotel_settings

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /* ─── The ENCRYPTED_KEYS list itself ─── */

    public function test_encrypted_keys_list_is_complete_and_exact(): void
    {
        // Lock the four credential-bearing keys. Adding a 5th
        // credential to this list is a deliberate architectural
        // decision — this test catches accidental additions /
        // removals.
        $this->assertSame(
            [
                'stripe_secret_key',
                'stripe_webhook_secret',
                'booking_smoobu_api_key',
                'booking_smoobu_webhook_secret',
            ],
            HotelSetting::ENCRYPTED_KEYS,
            'ENCRYPTED_KEYS list changed — verify the migration story for the new/removed key first.',
        );
    }

    /* ─── Encrypt-on-save ─── */

    public function test_saving_stripe_secret_key_stores_ciphertext_in_raw_column(): void
    {
        $plaintext = 'sk_test_REAL_STRIPE_SECRET_KEY_LOOKING_VALUE_12345';

        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => $plaintext,
        ]);

        // Pull the RAW column value via the query builder (bypasses
        // the model accessor) — that's what an attacker reading the
        // DB would see.
        $raw = DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'stripe_secret_key')
            ->value('value');

        $this->assertNotSame($plaintext, $raw,
            'Raw DB column MUST NOT contain the plaintext secret.');
        // Sanity: the raw bytes must be decryptable via Crypt
        // (proves it's a Laravel cipher payload, not garbage).
        $this->assertSame($plaintext, Crypt::decryptString($raw));
    }

    public function test_all_four_encrypted_keys_are_actually_encrypted_on_save(): void
    {
        // Sweep across the entire ENCRYPTED_KEYS list — guards
        // against the "encryption applies for the first key but
        // the loop drops out before the 4th" class of bug.
        foreach (HotelSetting::ENCRYPTED_KEYS as $i => $key) {
            $plaintext = "PLAINTEXT_VALUE_{$i}";
            HotelSetting::create([
                'key'   => $key,
                'value' => $plaintext,
            ]);

            $raw = DB::table('hotel_settings')
                ->where('organization_id', $this->orgId)
                ->where('key', $key)
                ->value('value');

            $this->assertNotSame($plaintext, $raw,
                "Raw column for key={$key} MUST be ciphertext.");
            $this->assertSame($plaintext, Crypt::decryptString($raw),
                "Round-trip MUST recover the original plaintext for key={$key}.");
        }
    }

    public function test_non_encrypted_key_value_persists_in_plain(): void
    {
        // Non-credential keys (booking_currency, company_name,
        // etc.) MUST persist as plain text — those are queried
        // directly via ->value('value') / ->typed_value / etc.
        HotelSetting::create([
            'key'   => 'booking_currency',
            'value' => 'EUR',
        ]);

        $raw = DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'booking_currency')
            ->value('value');

        $this->assertSame('EUR', $raw,
            'Non-encrypted keys MUST NOT be encrypted (would break direct queries).');
    }

    public function test_empty_string_value_is_not_encrypted(): void
    {
        // Defensive: encrypting an empty string would produce a
        // ciphertext-looking blob for a "deliberately cleared"
        // value, breaking the "is the secret set?" check.
        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => '',
        ]);

        $raw = DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'stripe_secret_key')
            ->value('value');

        $this->assertSame('', $raw,
            'Empty string MUST NOT be encrypted.');
    }

    public function test_null_value_is_not_encrypted(): void
    {
        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => null,
        ]);

        $raw = DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'stripe_secret_key')
            ->value('value');

        $this->assertNull($raw,
            'Null MUST NOT be encrypted.');
    }

    /* ─── Decrypt-on-read accessor ─── */

    public function test_reading_value_attribute_returns_plaintext_transparently(): void
    {
        $plaintext = 'sk_test_ACCESSOR_TEST_VALUE';
        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => $plaintext,
        ]);

        // Re-fetch — Eloquent's accessor must decrypt transparently.
        $row = HotelSetting::where('key', 'stripe_secret_key')->first();

        $this->assertSame($plaintext, $row->value,
            'Accessor must return plaintext — callers never see ciphertext.');
    }

    public function test_reading_value_for_non_encrypted_key_returns_raw_unchanged(): void
    {
        HotelSetting::create([
            'key'   => 'company_name',
            'value' => 'Forrest Glamp',
        ]);

        $row = HotelSetting::where('key', 'company_name')->first();

        $this->assertSame('Forrest Glamp', $row->value);
    }

    /* ─── Legacy plaintext compatibility ─── */

    public function test_legacy_plaintext_row_reads_via_catch_path(): void
    {
        // Simulate a row that pre-dates encryption coverage —
        // raw plaintext sits in the column. The accessor's
        // try/catch must return it unchanged rather than throwing.
        //
        // Raw INSERT bypasses the saving event so no encryption
        // happens at write-time.
        DB::table('hotel_settings')->insert([
            'organization_id' => $this->orgId,
            'key'             => 'stripe_webhook_secret',
            'value'           => 'whsec_LEGACY_PLAINTEXT_VALUE',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $row = HotelSetting::where('key', 'stripe_webhook_secret')->first();

        $this->assertSame('whsec_LEGACY_PLAINTEXT_VALUE', $row->value,
            'Legacy plaintext rows MUST pass through accessor unchanged via the DecryptException catch path.');
    }

    public function test_legacy_plaintext_row_re_encrypts_on_next_save(): void
    {
        // The migration convergence rule: once a legacy plaintext
        // row gets touched (any save), it lands as ciphertext. Old
        // bytes never resurface in DB snapshots after the next
        // routine settings update.
        DB::table('hotel_settings')->insert([
            'organization_id' => $this->orgId,
            'key'             => 'booking_smoobu_api_key',
            'value'           => 'API_KEY_LEGACY_PLAINTEXT',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // Touch the row via the model (triggers `saving` event).
        $row = HotelSetting::where('key', 'booking_smoobu_api_key')->first();
        $row->save();

        // Raw column is now ciphertext.
        $raw = DB::table('hotel_settings')
            ->where('organization_id', $this->orgId)
            ->where('key', 'booking_smoobu_api_key')
            ->value('value');

        $this->assertNotSame('API_KEY_LEGACY_PLAINTEXT', $raw,
            'After save, raw column MUST be ciphertext.');
        $this->assertSame('API_KEY_LEGACY_PLAINTEXT', Crypt::decryptString($raw),
            'After save, round-trip MUST recover the legacy plaintext.');
    }

    /* ─── Idempotency of the saving event ─── */

    public function test_saving_an_already_encrypted_value_does_not_double_encrypt(): void
    {
        // The saving event's idempotency guard: if the value is
        // already a valid Laravel cipher payload, skip encryption.
        // Without this, every save adds another layer of encryption
        // and the value becomes unreadable.
        $plaintext = 'sk_test_IDEMPOTENT_VALUE';

        $row = HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => $plaintext,
        ]);

        // Touch the row 3 more times — each save runs through the
        // saving event.
        $row->save();
        $row->save();
        $row->save();

        // Read back via the accessor — must still be the ORIGINAL
        // plaintext, not a triple-encrypted mess.
        $reread = HotelSetting::where('key', 'stripe_secret_key')->first();
        $this->assertSame($plaintext, $reread->value,
            'Repeated saves MUST NOT double-encrypt — value stays recoverable.');
    }

    /* ─── Cache exclusion ─── */

    public function test_cached_map_excludes_encrypted_keys(): void
    {
        // CRITICAL: under CACHE_STORE=database, the cached map
        // lands in Postgres as PLAINTEXT. If encrypted keys
        // leaked into the cached map, the at-rest encryption is
        // defeated by the cache layer. Verify via the public
        // getValue() API — the cached path goes through
        // cachedMapFor.
        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => 'sk_test_SHOULD_NOT_REACH_CACHE',
        ]);
        HotelSetting::create([
            'key'   => 'booking_currency',
            'value' => 'EUR',
        ]);

        // Non-encrypted key surfaces via the cache normally.
        $this->assertSame('EUR', HotelSetting::getValue('booking_currency'));

        // Encrypted key NEVER goes through the cache map. getValue()
        // returns the default for an excluded-from-map key —
        // the explicit "cache map skips encrypted keys" contract.
        $this->assertSame('default-fallback',
            HotelSetting::getValue('stripe_secret_key', 'default-fallback'),
            'getValue() via cached map MUST NOT surface encrypted keys (defeats at-rest encryption under db cache).',
        );
    }

    /* ─── Cross-tenant isolation defense ─── */

    public function test_org_a_encrypted_value_unrecoverable_in_org_b_context(): void
    {
        // Each org's encrypted value uses the platform-wide APP_KEY,
        // BUT the global TenantScope must still prevent org B from
        // even seeing org A's row. Defense in depth: even though
        // the encryption itself isn't per-tenant, query scoping is.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        HotelSetting::create([
            'key'   => 'stripe_secret_key',
            'value' => 'sk_test_ORG_A_SECRET',
        ]);

        // Switch tenant context to org B.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);

        $row = HotelSetting::where('key', 'stripe_secret_key')->first();
        $this->assertNull($row,
            'Tenant scope MUST prevent org B from seeing org A\'s encrypted row.');
    }
}
