<?php

namespace Tests\Feature\Mail;

use App\Models\EmailSuppression;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Proves that suppression is enforced at the TRANSPORT, not at any one call
 * site.
 *
 * This is the load-bearing claim of the design: there are ~26 send sites across
 * 18 files and only one consults EmailComplianceService, so a query-level
 * filter cannot be trusted. Laravel's MessageSending event fires immediately
 * before the transport and a listener returning false cancels the send, which
 * makes it the only point a future call site cannot bypass.
 *
 * These tests send through the real Mailer (log transport) rather than
 * Mail::fake(), because Mail::fake() replaces the Mailer entirely and would
 * never fire MessageSending — it would assert nothing about the thing under
 * test.
 */
class SuppressionEnforcementTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Only the one table this touches; the full migration set contains
        // Postgres-only lookups sqlite cannot evaluate.
        if (!Schema::hasTable('email_suppressions')) {
            Schema::create('email_suppressions', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable()->index();
                $t->string('email', 191);
                $t->string('reason', 32);
                $t->string('source', 32)->default('manual');
                $t->text('detail')->nullable();
                $t->unsignedSmallInteger('failure_count')->default(1);
                $t->timestamp('last_failed_at')->nullable();
                $t->timestamps();
                $t->unique(['organization_id', 'email']);
            });
        }

        EmailSuppression::query()->delete();
        config(['mail.default' => 'log']);
    }

    protected function tearDown(): void
    {
        app()->forgetInstance('current_organization_id');
        parent::tearDown();
    }

    public function test_a_clean_address_is_delivered_to_the_transport(): void
    {
        $result = Mail::raw('hello', fn ($m) => $m->to('clean@example.com')->subject('probe'));

        $this->assertNotNull($result,
            'An address with no suppression must reach the transport.');
    }

    public function test_a_platform_wide_suppression_blocks_the_send(): void
    {
        EmailSuppression::suppress('dead@example.com', EmailSuppression::HARD_BOUNCE, null, 'ses');

        $result = Mail::raw('hello', fn ($m) => $m->to('dead@example.com')->subject('probe'));

        $this->assertNull($result,
            'A hard-bounced address must never be mailed again, from any tenant.');
    }

    public function test_suppression_matching_is_case_insensitive(): void
    {
        EmailSuppression::suppress('Mixed.Case@Example.COM', EmailSuppression::COMPLAINT, null, 'ses');

        $result = Mail::raw('hello', fn ($m) => $m->to('mixed.case@example.com')->subject('probe'));

        $this->assertNull($result,
            'A suppression that misses on capitalisation is worse than none — it reads as working.');
    }

    public function test_a_tenant_scoped_suppression_does_not_block_another_tenant(): void
    {
        // Unsubscribing from venue 1 must not silence venue 2.
        EmailSuppression::suppress('member@example.com', EmailSuppression::UNSUBSCRIBE, 1, 'app');

        app()->instance('current_organization_id', 2);
        $result = Mail::raw('hello', fn ($m) => $m->to('member@example.com')->subject('probe'));

        $this->assertNotNull($result,
            'An opt-out belongs to the tenant it was made against, not to the address globally.');
    }

    public function test_a_tenant_scoped_suppression_blocks_that_tenant(): void
    {
        EmailSuppression::suppress('member@example.com', EmailSuppression::UNSUBSCRIBE, 1, 'app');

        app()->instance('current_organization_id', 1);
        $result = Mail::raw('hello', fn ($m) => $m->to('member@example.com')->subject('probe'));

        $this->assertNull($result);
    }

    public function test_suppression_applies_to_cc_and_bcc_not_just_to(): void
    {
        EmailSuppression::suppress('dead@example.com', EmailSuppression::HARD_BOUNCE, null, 'ses');

        $result = Mail::raw('hello', fn ($m) => $m
            ->to('fine@example.com')
            ->cc('dead@example.com')
            ->subject('probe'));

        $this->assertNull($result,
            'A suppressed address in CC is still a delivery to a dead mailbox.');
    }

    /* ─── the record itself ─── */

    public function test_repeat_suppression_bumps_the_counter_rather_than_duplicating(): void
    {
        EmailSuppression::suppress('soft@example.com', EmailSuppression::SOFT_BOUNCE, null, 'ses');
        EmailSuppression::suppress('soft@example.com', EmailSuppression::SOFT_BOUNCE, null, 'ses');

        $rows = EmailSuppression::where('email', 'soft@example.com')->get();

        $this->assertCount(1, $rows, 'Providers redeliver webhooks; a duplicate must not create a second row.');
        $this->assertSame(2, $rows->first()->failure_count);
    }

    public function test_a_permanent_reason_upgrades_an_existing_softer_one(): void
    {
        EmailSuppression::suppress('x@example.com', EmailSuppression::SOFT_BOUNCE, null, 'ses');
        EmailSuppression::suppress('x@example.com', EmailSuppression::COMPLAINT, null, 'ses');

        $this->assertSame(
            EmailSuppression::COMPLAINT,
            EmailSuppression::where('email', 'x@example.com')->first()->reason,
            'A spam complaint arriving after a soft bounce must not be swallowed by it.',
        );
    }

    public function test_an_empty_address_is_treated_as_suppressed(): void
    {
        $this->assertTrue(EmailSuppression::isSuppressed('', null));
        $this->assertTrue(EmailSuppression::isSuppressed('   ', null));
    }
}
