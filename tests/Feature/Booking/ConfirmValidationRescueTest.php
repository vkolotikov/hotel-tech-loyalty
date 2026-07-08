<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\BookingPublicController;
use App\Models\AuditLog;
use App\Services\BookingEngineService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the fix for the 2026-06-30 Forrest Glamp incident: a booking
 * whose /confirm failed INPUT VALIDATION left the guest's Stripe
 * authorization held for 7 days with zero trace.
 *
 * Root cause: BookingPublicController::confirm() used
 * $request->validate(), which throws ValidationException straight to
 * the framework's 422 handler — BEFORE the try/catch that both writes
 * the `booking.confirm.failed` audit row AND cancels the held
 * PaymentIntent. Because the widget runs stripe.confirmPayment()
 * *before* POSTing /confirm, the card is already authorized by the
 * time a malformed body lands. So a bare 422 meant:
 *   - the €150 hold sat uncaptured for 7 days (guest saw a "charge"),
 *   - no audit row (diag:recent-confirm-failures showed nothing),
 *   - staff had to hand-create the reservation in Smoobu.
 *
 * The fix routes validation failure through the SAME audit + PI-rescue
 * path every other confirm failure uses.
 *
 * These tests exercise the validation-failure branch end-to-end
 * WITHOUT touching Stripe: with no payment_intent_id (and no hold
 * carrying a cached PI), rescuePaymentIntentOnConfirmFailure() returns
 * at its `if (!$intentId) return;` guard before constructing
 * StripeService.
 */
class ConfirmValidationRescueTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->string('subject_type')->nullable();
                $t->unsignedBigInteger('subject_id')->nullable();
                $t->string('action');
                $t->text('old_values')->nullable();
                $t->text('new_values')->nullable();
                $t->string('causer_type')->nullable();
                $t->unsignedBigInteger('causer_id')->nullable();
                $t->string('ip_address', 64)->nullable();
                $t->text('user_agent')->nullable();
                $t->text('description')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'action']);
            });
        }

        // booking_holds is read best-effort by both helpers (wrapped in
        // try/catch), but create it so the lookups exercise the real
        // "hold not found" path rather than a missing-table catch.
        if (!Schema::hasTable('booking_holds')) {
            Schema::create('booking_holds', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('hold_token', 64);
                $t->text('payload_json')->nullable();
                $t->string('status', 16)->default('active');
                $t->timestamp('expires_at')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'hold_token']);
            });
        }

        $org = OrganizationFactory::new()->create(['widget_token' => 'wtok_test_123']);
        $this->orgId = $org->id;
        // bindOrg() no-ops when this is already bound (see controller).
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /**
     * Build a JSON POST /confirm request with the given body.
     */
    private function confirmRequest(array $body): Request
    {
        return Request::create(
            '/v1/booking/wtok_test_123/confirm',
            'POST',
            [], [], [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'],
            json_encode($body),
        );
    }

    private function invokeConfirm(Request $request)
    {
        $controller = app(BookingPublicController::class);
        // BookingEngineService is never reached on the validation-fail
        // path (we return before it), so a bare instance is fine.
        return $controller->confirm($request, app(BookingEngineService::class));
    }

    /* ─── The core contract ─── */

    public function test_validation_failure_writes_confirm_failed_audit_row(): void
    {
        // Missing guest.last_name → validation fails. No payment_intent_id
        // → rescue is a no-op (never touches Stripe).
        $response = $this->invokeConfirm($this->confirmRequest([
            'hold_token' => 'htok_orphaned_123',
            'guest'      => ['first_name' => 'Marija', 'email' => 'marmolli2103@gmail.com'],
            // last_name deliberately omitted
        ]));

        $this->assertSame(422, $response->getStatusCode());

        $row = AuditLog::where('organization_id', $this->orgId)
            ->where('action', 'booking.confirm.failed')
            ->latest('id')
            ->first();

        $this->assertNotNull($row,
            'A validation failure MUST write a booking.confirm.failed audit row '
            . '(was invisible before the fix — diag:recent-confirm-failures showed nothing).');
        $this->assertSame('validation', $row->new_values['stage'] ?? null,
            'The audit row MUST be stamped stage=validation.');
        $this->assertArrayHasKey('validation_errors', $row->new_values,
            'The audit row MUST carry the structured validation errors.');
        $this->assertArrayHasKey('guest.last_name', $row->new_values['validation_errors'],
            'The specific failing field MUST be recorded (guest.last_name here).');
    }

    public function test_validation_failure_returns_422_with_errors_and_hold_hint(): void
    {
        $response = $this->invokeConfirm($this->confirmRequest([
            'hold_token' => 'htok_orphaned_456',
            'guest'      => ['first_name' => 'Marija'], // missing last_name + email
        ]));

        $this->assertSame(422, $response->getStatusCode());

        $data = $response->getData(true);
        $this->assertArrayHasKey('errors', $data);
        $this->assertArrayHasKey('error', $data);
        // The customer-facing message must reassure that a hold isn't a
        // real charge (the source of Marija's "оплата прошла" confusion).
        $this->assertStringContainsStringIgnoringCase('hold', $data['error']);
    }

    public function test_validation_failure_with_no_payment_intent_does_not_crash(): void
    {
        // Explicit lock on the "no PI → rescue no-op → no Stripe" path.
        // If a future refactor made the rescue construct StripeService
        // unconditionally, this test would surface it (Stripe not
        // configured in tests → would throw).
        $response = $this->invokeConfirm($this->confirmRequest([
            'hold_token' => 'htok_no_pi',
            'guest'      => ['email' => 'x@y.com'], // missing first + last name
        ]));

        $this->assertSame(422, $response->getStatusCode());
        // Reached here without an exception → rescue safely no-op'd.
        $this->assertTrue(true);
    }

    public function test_missing_hold_token_still_audits_and_422s(): void
    {
        // Even the most-broken body (no hold_token at all) must not
        // escape silently — it still writes the audit + returns 422.
        $response = $this->invokeConfirm($this->confirmRequest([
            'guest' => ['first_name' => 'A', 'last_name' => 'B', 'email' => 'a@b.com'],
            // hold_token omitted entirely
        ]));

        $this->assertSame(422, $response->getStatusCode());

        $count = AuditLog::where('organization_id', $this->orgId)
            ->where('action', 'booking.confirm.failed')
            ->count();
        $this->assertGreaterThanOrEqual(1, $count);
    }
}
