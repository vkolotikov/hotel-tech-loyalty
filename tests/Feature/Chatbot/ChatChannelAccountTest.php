<?php

namespace Tests\Feature\Chatbot;

use App\Models\ChatChannelAccount;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the ChatChannelAccount contract (Chat Phase 1: Messenger
 * page-token storage + isActive gating).
 *
 * Five surfaces locked:
 *
 *   1. page_access_token encryption (mirrors HotelSetting::ENCRYPTED_KEYS):
 *      - saving event encrypts plaintext via Crypt::encryptString
 *      - getPageAccessTokenAttribute decrypts on read (transparent)
 *      - Idempotent: re-saving an already-encrypted value doesn't
 *        double-encrypt (Crypt::decryptString try/catch skip path)
 *      - Legacy plaintext rows return plain (catch path), re-encrypt
 *        on next save (migration safety)
 *      - Null/empty token NOT encrypted (defensive)
 *
 *   2. $hidden — page_access_token MUST NOT serialise to JSON.
 *      Belt-and-braces: even with a leak in some serialise call path,
 *      the token won't surface in API responses.
 *
 *   3. isActive() composes status='active' AND token present.
 *      - 'reauth_required' / 'disconnected' → false
 *      - 'active' but no token → false (disconnected mid-token-rotation)
 *
 *   4. CHANNEL_* + STATUS_* constants — locked to documented values
 *      (regression-guard against typos breaking the channel router).
 *
 *   5. markError truncates the message at 2000 chars; clearError is a
 *      no-op when no error set (saveQuietly, no event fires).
 */
class ChatChannelAccountTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('chat_channel_accounts')) {
            Schema::create('chat_channel_accounts', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('channel', 32);
                $t->string('external_id')->nullable();
                $t->string('display_name')->nullable();
                $t->string('display_avatar_url')->nullable();
                $t->text('page_access_token')->nullable();
                $t->string('status', 32)->default('active');
                $t->timestamp('token_verified_at')->nullable();
                $t->timestamp('last_webhook_at')->nullable();
                $t->text('last_error')->nullable();
                $t->text('meta_config')->nullable();
                $t->unsignedBigInteger('connected_by_user_id')->nullable();
                $t->text('token_scopes')->nullable();
                $t->timestamp('token_expires_at')->nullable();
                $t->timestamp('data_access_expires_at')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'channel']);
            });
        }

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

    private function account(array $attrs = []): ChatChannelAccount
    {
        return ChatChannelAccount::create(array_merge([
            'organization_id' => $this->orgId,
            'channel'         => 'messenger',
            'external_id'     => 'page_' . uniqid(),
            'display_name'    => 'Test Page',
            'status'          => 'active',
            'page_access_token' => 'EAATEST_token_for_testing_12345',
        ], $attrs));
    }

    /* ─── 1. Encrypt-on-save: raw column MUST hold ciphertext ─── */

    public function test_page_access_token_stored_as_ciphertext_in_raw_column(): void
    {
        // CRITICAL: a DB snapshot must NOT leak the page access
        // token. Verify via direct query-builder bypass of the
        // accessor.
        $plaintext = 'EAATEST_VeryRealLookingMetaToken_abcdef123';
        $this->account(['page_access_token' => $plaintext]);

        $raw = DB::table('chat_channel_accounts')
            ->where('organization_id', $this->orgId)
            ->value('page_access_token');

        $this->assertNotSame($plaintext, $raw,
            'Raw column MUST NOT contain plaintext.');
        $this->assertSame($plaintext, Crypt::decryptString($raw),
            'Round-trip via Crypt MUST recover plaintext.');
    }

    public function test_accessor_returns_plaintext_transparently(): void
    {
        $plaintext = 'EAATEST_AccessorRoundTrip_xyz';
        $this->account(['page_access_token' => $plaintext]);

        $row = ChatChannelAccount::first();

        $this->assertSame($plaintext, $row->page_access_token,
            'Accessor MUST return plaintext (transparent decrypt).');
    }

    public function test_saving_already_encrypted_token_does_NOT_double_encrypt(): void
    {
        // Idempotency: the saving event try/catches a decrypt. If
        // it succeeds, the value is already encrypted → skip. Without
        // this guard, every save would add another encryption layer
        // and the value becomes unreadable after a few saves.
        $plaintext = 'EAATEST_IdempotencyTest';
        $row = $this->account(['page_access_token' => $plaintext]);

        // Touch the row 3 more times — triggers saving event each time.
        $row->save();
        $row->save();
        $row->save();

        $rehydrated = ChatChannelAccount::first();
        $this->assertSame($plaintext, $rehydrated->page_access_token,
            'Repeated saves MUST NOT double-encrypt — value stays decryptable.');
    }

    public function test_null_token_persists_as_null(): void
    {
        // Defensive: a row created without a token (yet-to-be-
        // connected account, mid-flow) MUST persist null rather
        // than encrypt the empty value.
        $this->account(['page_access_token' => null]);

        $raw = DB::table('chat_channel_accounts')
            ->where('organization_id', $this->orgId)
            ->value('page_access_token');
        $this->assertNull($raw);
    }

    public function test_empty_string_token_persists_as_empty(): void
    {
        $this->account(['page_access_token' => '']);

        $raw = DB::table('chat_channel_accounts')
            ->where('organization_id', $this->orgId)
            ->value('page_access_token');
        $this->assertSame('', $raw,
            'Empty string MUST NOT be encrypted (would defeat the "is the token set?" check).');
    }

    /* ─── Legacy plaintext compatibility (HotelSetting pattern) ─── */

    public function test_legacy_plaintext_row_reads_via_catch_path(): void
    {
        // Direct INSERT bypasses the saving event → raw plaintext.
        // The accessor's catch block returns it unchanged so
        // existing rows pre-encryption-rollout don't break.
        DB::table('chat_channel_accounts')->insert([
            'organization_id'   => $this->orgId,
            'channel'           => 'messenger',
            'external_id'       => 'page_legacy',
            'page_access_token' => 'LEGACY_PLAINTEXT_TOKEN',
            'status'            => 'active',
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        $row = ChatChannelAccount::first();
        $this->assertSame('LEGACY_PLAINTEXT_TOKEN', $row->page_access_token,
            'Legacy plaintext MUST surface via accessor catch path.');
    }

    public function test_legacy_plaintext_row_re_encrypts_on_next_save(): void
    {
        // Migration convergence: once touched, the row's token
        // lands as ciphertext.
        DB::table('chat_channel_accounts')->insert([
            'organization_id'   => $this->orgId,
            'channel'           => 'messenger',
            'external_id'       => 'page_legacy_2',
            'page_access_token' => 'LEGACY_BEFORE_SAVE',
            'status'            => 'active',
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        $row = ChatChannelAccount::first();
        $row->save();

        $raw = DB::table('chat_channel_accounts')
            ->where('id', $row->id)
            ->value('page_access_token');
        $this->assertNotSame('LEGACY_BEFORE_SAVE', $raw,
            'After save, raw column MUST be ciphertext.');
        $this->assertSame('LEGACY_BEFORE_SAVE', Crypt::decryptString($raw),
            'Round-trip recovers the legacy plaintext.');
    }

    /* ─── 2. $hidden — token MUST NOT serialise to JSON ─── */

    public function test_page_access_token_is_hidden_from_json_serialisation(): void
    {
        // CRITICAL: even if some downstream API path JSON-serialises
        // a ChatChannelAccount, the token MUST stay server-side.
        // Belt-and-braces against future code path leaks.
        $account = $this->account(['page_access_token' => 'EAATEST_SecretToken']);

        $json = $account->toJson();
        $array = json_decode($json, true);

        $this->assertArrayNotHasKey('page_access_token', $array,
            'CRITICAL: page_access_token MUST NOT appear in JSON output.');
        // Sanity: other fields still surface.
        $this->assertSame('messenger', $array['channel']);
    }

    /* ─── 3. isActive() ─── */

    public function test_isActive_true_when_status_active_and_token_present(): void
    {
        $account = $this->account([
            'status'            => 'active',
            'page_access_token' => 'EAATEST_present',
        ]);

        $this->assertTrue($account->isActive());
    }

    public function test_isActive_false_when_status_reauth_required(): void
    {
        // Meta token expired / scope revoked → reauth_required.
        // ChannelRouter::sendOutbound checks isActive — sending
        // with this status would 401 and burn the customer's
        // outbound message.
        $account = $this->account([
            'status'            => 'reauth_required',
            'page_access_token' => 'EAATEST_stale',
        ]);

        $this->assertFalse($account->isActive(),
            'reauth_required status MUST NOT be active even if token present.');
    }

    public function test_isActive_false_when_status_disconnected(): void
    {
        $account = $this->account([
            'status'            => 'disconnected',
            'page_access_token' => 'EAATEST_old',
        ]);

        $this->assertFalse($account->isActive());
    }

    public function test_isActive_false_when_token_is_empty(): void
    {
        // Defensive: 'active' status but missing token (rare —
        // mid-rotation or seed bug). MUST NOT report active.
        $account = $this->account([
            'status'            => 'active',
            'page_access_token' => '',
        ]);

        $this->assertFalse($account->isActive(),
            'Empty token MUST yield isActive=false regardless of status.');
    }

    /* ─── 4. CHANNEL_* + STATUS_* constants ─── */

    public function test_channel_constants_are_locked_canonical_strings(): void
    {
        // Lock the constants — the ChannelRouter routes by these
        // exact string values. A typo would silently break routing.
        $this->assertSame('messenger', ChatChannelAccount::CHANNEL_MESSENGER);
        $this->assertSame('whatsapp',  ChatChannelAccount::CHANNEL_WHATSAPP);
        $this->assertSame('instagram', ChatChannelAccount::CHANNEL_INSTAGRAM);
    }

    public function test_status_constants_are_locked_canonical_strings(): void
    {
        $this->assertSame('active',           ChatChannelAccount::STATUS_ACTIVE);
        $this->assertSame('reauth_required',  ChatChannelAccount::STATUS_REAUTH);
        $this->assertSame('disconnected',     ChatChannelAccount::STATUS_DISCONNECTED);
    }

    /* ─── 5. Error helpers ─── */

    public function test_markError_truncates_message_at_2000_chars(): void
    {
        // Defensive: a giant error message (e.g. an HTML body
        // pasted from Meta's API error) MUST NOT blow up the
        // text column or burn UI rendering.
        $account = $this->account();
        $huge = str_repeat('A', 5000);

        $account->markError($huge);

        $account->refresh();
        $this->assertSame(2000, mb_strlen($account->last_error),
            'markError MUST truncate at 2000 chars.');
    }

    public function test_clearError_noops_when_error_already_null(): void
    {
        // When the account is healthy, clearError shouldn't pay
        // for an UPDATE just to set null=null. The implementation
        // short-circuits on $this->last_error !== null.
        $account = $this->account(['last_error' => null]);
        $originalUpdatedAt = $account->updated_at;
        // Force a small wait so any UPDATE would visibly bump
        // updated_at — even without saveQuietly, the seconds
        // would change.
        sleep(1);

        $account->clearError();

        $account->refresh();
        $this->assertSame((string) $originalUpdatedAt, (string) $account->updated_at,
            'clearError on already-null MUST NOT fire an UPDATE (short-circuit).');
    }

    public function test_clearError_does_clear_when_error_present(): void
    {
        $account = $this->account(['last_error' => 'something broke']);
        $this->assertNotNull($account->last_error);

        $account->clearError();
        $account->refresh();

        $this->assertNull($account->last_error,
            'clearError MUST set last_error to null when set.');
    }
}
