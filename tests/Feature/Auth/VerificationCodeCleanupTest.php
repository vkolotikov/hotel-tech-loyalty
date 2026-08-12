<?php

namespace Tests\Feature\Auth;

use App\Models\EmailVerificationCode;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * POST /v1/auth/send-code — code-row lifecycle around mail failures.
 *
 * startTrial gates on "does a verification code exist for this email":
 * if one does, the signup MUST be verified or it is rejected 422. That
 * makes an orphaned, undeliverable code row a hard blocker rather than
 * an inert leftover — the client's 502 fallback (skip verification when
 * mail is down) would sail past the verify step and then be refused at
 * signup for a code the user was never sent.
 *
 * So: a send that throws must leave NO code behind.
 *
 * Builds only the one table it touches instead of using RefreshDatabase.
 * The full migration set contains Postgres-specific `pg_indexes` lookups
 * that sqlite cannot evaluate (see AUDIT-2026-06-13-ADDENDUM.md testing
 * recommendation #1), which is why the migration-backed feature tests in
 * this suite skip rather than run. This endpoint reads and writes exactly
 * one table, so it can be covered for real.
 *
 * The mail failure is induced by pointing the mailer at a transport that
 * does not exist, NOT by mocking the Mail facade. A facade mock here
 * swapped the shared container binding for the rest of the process and
 * segfaulted PHP several hundred tests later; config is process-local to
 * the test and restored automatically.
 */
class VerificationCodeCleanupTest extends TestCase
{
    private const ENDPOINT = '/api/v1/auth/send-code';

    protected function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasTable('email_verification_codes')) {
            Schema::create('email_verification_codes', function (Blueprint $table) {
                $table->id();
                $table->string('email')->index();
                $table->string('code', 6);
                $table->timestamp('expires_at');
                $table->timestamp('verified_at')->nullable();
                $table->timestamps();
            });
        }

        // Each test starts from an empty table. Truncating beats dropping
        // and recreating: the sqlite connection is shared process-wide, so
        // churning schema between tests destabilises later suites.
        EmailVerificationCode::query()->delete();
    }

    public function test_successful_send_leaves_a_code_row(): void
    {
        Mail::fake();

        $this->postJson(self::ENDPOINT, [
            'email' => 'owner@example.com',
            'name'  => 'Owner',
        ])->assertOk();

        $this->assertSame(
            1,
            EmailVerificationCode::where('email', 'owner@example.com')->count(),
            'A successful send must persist exactly one code row.',
        );
    }

    public function test_mail_failure_removes_the_code_row_and_returns_502(): void
    {
        // Simulate an SMTP / transport failure at dispatch time.
        config(['mail.default' => 'no-such-transport']);

        $this->postJson(self::ENDPOINT, [
            'email' => 'owner@example.com',
            'name'  => 'Owner',
        ])->assertStatus(502);

        // The row written moments before the failure must be gone —
        // otherwise startTrial's "a code was sent" gate traps this user.
        $this->assertSame(
            0,
            EmailVerificationCode::where('email', 'owner@example.com')->count(),
            'A failed send must not leave an undeliverable code behind.',
        );
    }

    public function test_immediate_resend_is_throttled(): void
    {
        Mail::fake();

        $this->postJson(self::ENDPOINT, ['email' => 'owner@example.com', 'name' => 'Owner'])->assertOk();

        // Back-to-back sends are rate-limited rather than blasting the
        // address. The limit is derived from the stored code's created_at
        // (one per email per 60s), not from a cache counter.
        $this->postJson(self::ENDPOINT, ['email' => 'owner@example.com', 'name' => 'Owner'])
            ->assertStatus(429)
            ->assertJson(['error' => 'Please wait before requesting another code.']);
    }

    public function test_resend_supersedes_the_previous_unverified_code(): void
    {
        Mail::fake();

        $this->postJson(self::ENDPOINT, ['email' => 'owner@example.com', 'name' => 'Owner'])->assertOk();
        $first = EmailVerificationCode::where('email', 'owner@example.com')->firstOrFail();

        // Step past the 60-second send window — this test is about code
        // supersession, which the previous assertion already proves is
        // unreachable back-to-back.
        $this->travel(2)->minutes();

        $this->postJson(self::ENDPOINT, ['email' => 'owner@example.com', 'name' => 'Owner'])->assertOk();

        // Exactly one live code at a time — a stale second row would let an
        // older code keep working after the user asked for a fresh one.
        $rows = EmailVerificationCode::where('email', 'owner@example.com')->get();
        $this->assertCount(1, $rows);
        $this->assertNotSame($first->id, $rows->first()->id);
    }

    public function test_email_is_normalised_before_storage(): void
    {
        Mail::fake();

        $this->postJson(self::ENDPOINT, [
            'email' => '  OWNER@Example.COM ',
            'name'  => 'Owner',
        ])->assertOk();

        // Codes are matched on exact equality at verify time, so casing and
        // surrounding whitespace must be normalised on the way in or the
        // user can never verify.
        $this->assertSame(
            1,
            EmailVerificationCode::where('email', 'owner@example.com')->count(),
        );
    }
}
