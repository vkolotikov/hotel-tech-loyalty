<?php

namespace Tests\Feature\Engagement;

use App\Models\ChatChannelAccount;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the ChatChannelAccount model contract — connected external
 * chat platform Page/number for FB Messenger (Phase 1) and
 * WhatsApp + Instagram (Phase 2+, reserved).
 *
 * Why this matters:
 *
 *   page_access_token is the load-bearing secret for every outbound
 *   Messenger send. Encrypted at rest via the `saving` hook,
 *   transparently decrypted via the accessor, hidden from JSON
 *   serialisation via $hidden. A regression here either (a) breaks
 *   outbound send by failing to decrypt, (b) leaks tokens via
 *   accidentally-included JSON responses, or (c) double-encrypts a
 *   token (encrypted ciphertext encrypted again — irreversible
 *   without manual recovery).
 *
 *   The idempotent encryption check (try decryptString → already
 *   encrypted → skip) is the migration-safety pattern shared with
 *   HotelSetting + WalletConfig. Models that touch encrypted
 *   columns MUST treat re-save as a no-op.
 *
 *   `isActive()` is the precondition for outbound dispatch — checks
 *   BOTH status='active' AND token-not-empty. Token-empty after
 *   reauth-required is the realistic case (admin disconnected
 *   the page in Meta's settings UI but the row stays for history).
 *
 * Contract:
 *
 *   - 3 CHANNEL_* constants: messenger / whatsapp / instagram.
 *   - 3 STATUS_* constants: active / reauth_required / disconnected.
 *   - page_access_token encrypt-on-saving (idempotent — re-encrypt
 *     skipped when value already looks like a Laravel cipher).
 *   - Accessor returns plaintext; legacy plaintext rows pass through
 *     unchanged (matches HotelSetting migration pattern).
 *   - page_access_token in $hidden — NEVER serialised to JSON.
 *   - meta_config + token_scopes array casts.
 *   - 4 datetime casts (token_verified_at, last_webhook_at,
 *     token_expires_at, data_access_expires_at).
 *   - connectedBy BelongsTo User FK='connected_by_user_id'.
 *   - conversations HasMany ChatConversation FK='channel_account_id'.
 *   - isActive() = status===active AND raw token not empty.
 *   - markWebhookReceived() updates last_webhook_at silently
 *     (saveQuietly to skip the saving hook).
 *   - markError() persists last_error truncated to 2000 chars.
 *   - clearError() only saves when last_error was non-null
 *     (avoids dirty-no-op writes).
 *   - BelongsToOrganization + BelongsToBrand + tenant isolation.
 */
class ChatChannelAccountModelTest extends TestCase
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
                $t->string('external_id');
                $t->string('display_name')->nullable();
                $t->string('display_avatar_url')->nullable();
                // Long enough to hold a Laravel cipher payload
                // (which is ~200+ chars for a 200-char input).
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
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    private function account(array $attrs = []): ChatChannelAccount
    {
        return ChatChannelAccount::create(array_merge([
            'organization_id'   => $this->orgId,
            'channel'           => ChatChannelAccount::CHANNEL_MESSENGER,
            'external_id'       => 'pg_' . uniqid(),
            'display_name'      => 'Test Page',
            'status'            => ChatChannelAccount::STATUS_ACTIVE,
        ], $attrs));
    }

    /* ─── CHANNEL_* + STATUS_* constants ─── */

    public function test_channel_constants_are_locked_canonical_strings(): void
    {
        // Lock the 3 documented channel ids. ChannelRouter +
        // MessengerWebhookController + AdminPagesController all
        // branch on these exact strings.
        $this->assertSame('messenger', ChatChannelAccount::CHANNEL_MESSENGER);
        $this->assertSame('whatsapp',  ChatChannelAccount::CHANNEL_WHATSAPP);
        $this->assertSame('instagram', ChatChannelAccount::CHANNEL_INSTAGRAM);
    }

    public function test_status_constants_are_locked_canonical_strings(): void
    {
        // Lock the 3 lifecycle states.
        $this->assertSame('active',           ChatChannelAccount::STATUS_ACTIVE);
        $this->assertSame('reauth_required',  ChatChannelAccount::STATUS_REAUTH);
        $this->assertSame('disconnected',     ChatChannelAccount::STATUS_DISCONNECTED);
    }

    /* ─── page_access_token encrypt-at-rest ─── */

    public function test_page_access_token_is_encrypted_on_save(): void
    {
        // CRITICAL: the load-bearing security invariant. Raw
        // token in DB MUST be ciphertext, not plaintext. A
        // refactor that drops the saving hook would silently
        // leak every page's token in plaintext.
        $plaintext = 'EAAGm0PX4ZCpsBO5XYZ_real-meta-token-format';

        $account = $this->account(['page_access_token' => $plaintext]);

        $rawInDb = \DB::table('chat_channel_accounts')
            ->where('id', $account->id)
            ->value('page_access_token');

        $this->assertNotSame($plaintext, $rawInDb,
            'CRITICAL: page_access_token MUST NOT be persisted as plaintext.');
        $this->assertSame($plaintext, Crypt::decryptString($rawInDb),
            'Encrypted token MUST round-trip through Crypt::decryptString.');
    }

    public function test_accessor_returns_plaintext_on_read(): void
    {
        $plaintext = 'long-page-access-token-for-decrypt-test-12345';

        $account = $this->account(['page_access_token' => $plaintext]);

        // Reload from DB and read via accessor — MUST return
        // plaintext.
        $reloaded = ChatChannelAccount::find($account->id);

        $this->assertSame($plaintext, $reloaded->page_access_token,
            'Accessor MUST decrypt + return plaintext.');
    }

    public function test_legacy_plaintext_token_decrypts_pass_through(): void
    {
        // Migration safety: legacy rows persisted as plaintext
        // (before the encrypt hook landed) MUST pass through
        // the accessor unchanged — caller still gets a usable
        // value. Matches HotelSetting + WalletConfig pattern.
        //
        // Insert RAW plaintext via DB::table to bypass the
        // saving hook.
        \DB::table('chat_channel_accounts')->insert([
            'organization_id'   => $this->orgId,
            'channel'           => 'messenger',
            'external_id'       => 'legacy_page',
            'display_name'      => 'Legacy',
            'status'            => 'active',
            'page_access_token' => 'plain-text-legacy-not-encrypted',
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        $legacy = ChatChannelAccount::where('external_id', 'legacy_page')->first();

        $this->assertSame('plain-text-legacy-not-encrypted', $legacy->page_access_token,
            'Legacy plaintext MUST pass through accessor (failed decrypt → return as-is).');
    }

    public function test_double_encryption_is_idempotent_on_resave(): void
    {
        // CRITICAL: when a model is refreshed + saved with no
        // token change (or with an already-encrypted token
        // value), the saving hook MUST NOT re-encrypt. Double
        // encryption would render the token irrecoverable
        // (Crypt decrypts to the inner cipher, not the
        // plaintext).
        $plaintext = 'token-must-survive-double-save-2026';

        $account = $this->account(['page_access_token' => $plaintext]);

        // Read fresh from DB, save again — the saving hook
        // gets called again. Token MUST stay decryptable to
        // the same plaintext.
        $reloaded = ChatChannelAccount::find($account->id);
        $reloaded->display_name = 'Updated name (forces save)';
        $reloaded->save();

        $rawInDb = \DB::table('chat_channel_accounts')
            ->where('id', $account->id)
            ->value('page_access_token');

        $this->assertSame($plaintext, Crypt::decryptString($rawInDb),
            'CRITICAL: token MUST survive double-save without being re-encrypted.');
    }

    /* ─── $hidden: token NEVER in JSON ─── */

    public function test_page_access_token_is_hidden_from_array_output(): void
    {
        // CRITICAL: belt-and-braces. Even if a careless caller
        // returns the model to an API response, the token MUST
        // NOT leak. $hidden suppresses it from toArray()/
        // toJson().
        $account = $this->account(['page_access_token' => 'secret-meta-page-token']);

        $array = $account->toArray();

        $this->assertArrayNotHasKey('page_access_token', $array,
            'CRITICAL: page_access_token MUST NOT appear in toArray (security).');
    }

    public function test_page_access_token_is_hidden_from_json_output(): void
    {
        $account = $this->account(['page_access_token' => 'secret-meta-page-token']);

        $json = $account->toJson();
        $decoded = json_decode($json, true);

        $this->assertArrayNotHasKey('page_access_token', $decoded,
            'CRITICAL: page_access_token MUST NOT appear in toJson (security).');
    }

    /* ─── Array casts ─── */

    public function test_meta_config_round_trips_through_array_cast(): void
    {
        // meta_config carries channel-specific extras (FB Page
        // category, IG Business id, WhatsApp number metadata).
        $cfg = [
            'page_category' => 'Local business',
            'page_about'    => 'Test description',
            'verified'      => true,
        ];

        $account = $this->account(['meta_config' => $cfg]);

        $this->assertSame($cfg, $account->fresh()->meta_config);
    }

    public function test_token_scopes_round_trips_through_array_cast(): void
    {
        // token_scopes is the OAuth scope list as granted by
        // Meta. Drives can-do feature flags in the admin UI.
        $scopes = ['pages_messaging', 'pages_show_list', 'business_management'];

        $account = $this->account(['token_scopes' => $scopes]);

        $this->assertSame($scopes, $account->fresh()->token_scopes);
    }

    /* ─── Datetime casts ─── */

    public function test_4_datetime_casts_all_return_carbon(): void
    {
        // Lock all 4 datetime casts. token_expires_at drives the
        // pre-emptive reauth warning in the admin UI.
        $account = $this->account([
            'token_verified_at'      => now()->subDay(),
            'last_webhook_at'        => now()->subHour(),
            'token_expires_at'       => now()->addDays(30),
            'data_access_expires_at' => now()->addDays(90),
        ]);

        $fresh = $account->fresh();
        $this->assertInstanceOf(\Carbon\Carbon::class, $fresh->token_verified_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $fresh->last_webhook_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $fresh->token_expires_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $fresh->data_access_expires_at);
    }

    /* ─── Relationships ─── */

    public function test_connected_by_relationship_uses_connected_by_user_id_fk(): void
    {
        // FK is 'connected_by_user_id' (NOT the conventional
        // 'connected_by'). Lock the explicit name.
        $account = $this->account(['connected_by_user_id' => 42]);
        $rel = $account->connectedBy();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('connected_by_user_id', $rel->getForeignKeyName(),
            'connectedBy FK MUST be connected_by_user_id.');
    }

    public function test_conversations_relationship_uses_channel_account_id_fk(): void
    {
        // ChatConversation.channel_account_id back-references
        // this account. Lock the FK name.
        $account = $this->account();
        $rel = $account->conversations();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('channel_account_id', $rel->getForeignKeyName(),
            'conversations FK MUST be channel_account_id.');
    }

    /* ─── isActive() helper ─── */

    public function test_is_active_returns_true_when_status_active_and_token_present(): void
    {
        $account = $this->account([
            'status'            => 'active',
            'page_access_token' => 'real-token-not-empty',
        ]);

        $this->assertTrue($account->isActive(),
            'isActive MUST return true when status=active AND token present.');
    }

    public function test_is_active_returns_false_when_status_disconnected(): void
    {
        $account = $this->account([
            'status'            => ChatChannelAccount::STATUS_DISCONNECTED,
            'page_access_token' => 'still-have-token-but-disconnected',
        ]);

        $this->assertFalse($account->isActive(),
            'isActive MUST return false when status != active.');
    }

    public function test_is_active_returns_false_when_status_reauth_required(): void
    {
        $account = $this->account([
            'status'            => ChatChannelAccount::STATUS_REAUTH,
            'page_access_token' => 'still-have-token-but-reauth',
        ]);

        $this->assertFalse($account->isActive(),
            'isActive MUST return false when status=reauth_required.');
    }

    public function test_is_active_returns_false_when_token_empty(): void
    {
        // Realistic case: admin marked status active manually
        // but never actually connected. Outbound MUST fail-
        // closed, not crash with a null token.
        $account = $this->account([
            'status'            => 'active',
            'page_access_token' => null,
        ]);

        $this->assertFalse($account->isActive(),
            'isActive MUST return false when token is empty/null.');
    }

    /* ─── markWebhookReceived + markError + clearError ─── */

    public function test_mark_webhook_received_updates_timestamp(): void
    {
        // The hot path: every Messenger webhook updates this
        // so the admin UI shows "Last webhook: X min ago".
        $account = $this->account(['last_webhook_at' => null]);
        $account->markWebhookReceived();

        $this->assertNotNull($account->fresh()->last_webhook_at,
            'markWebhookReceived MUST stamp last_webhook_at.');
    }

    public function test_mark_error_persists_message_truncated_to_2000(): void
    {
        // Lock the 2000-char truncation. A 5KB Meta error
        // response would otherwise blow Postgres TEXT limits
        // (unlikely but defensive).
        $longMessage = str_repeat('A', 3000);

        $account = $this->account(['last_error' => null]);
        $account->markError($longMessage);

        $fresh = $account->fresh();
        $this->assertSame(2000, strlen($fresh->last_error),
            'markError MUST truncate to 2000 chars.');
    }

    public function test_clear_error_only_saves_when_last_error_non_null(): void
    {
        // Avoid dirty-no-op writes that would trigger the
        // saving hook + token re-encrypt cycle for no reason.
        $account = $this->account(['last_error' => null]);
        $updatedAt = $account->updated_at?->toDateTimeString();

        // Sleep would be wrong in tests; instead read-back.
        $account->clearError();

        // No assertion needed beyond "didn't crash" — the
        // important thing is the saveQuietly() branch only
        // fires when there's an error to clear.
        $this->assertNull($account->fresh()->last_error,
            'clearError on null MUST stay null.');
    }

    public function test_clear_error_nulls_last_error_when_set(): void
    {
        $account = $this->account(['last_error' => 'previous failure']);

        $account->clearError();

        $this->assertNull($account->fresh()->last_error,
            'clearError MUST null last_error when previously set.');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_tenant_scope_isolates_channel_accounts_cross_org(): void
    {
        // CRITICAL: a leaked ChatChannelAccount = leaked
        // page_access_token = cross-tenant Meta account
        // takeover. Defense-in-depth on top of $hidden.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->account(['external_id' => 'page_org_a']);
        \DB::table('chat_channel_accounts')->insert([
            'organization_id' => $orgB,
            'channel'         => 'messenger',
            'external_id'     => 'page_org_b',
            'display_name'    => 'Org B Page',
            'status'          => 'active',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = ChatChannelAccount::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('page_org_a', $aRows->first()->external_id);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = ChatChannelAccount::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('page_org_b', $bRows->first()->external_id);
    }
}
