<?php

namespace Tests\Feature\Booking;

use App\Enums\PaymentStatus;
use App\Http\Controllers\Api\V1\Admin\BookingAdminController;
use App\Models\BookingMirror;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks BookingAdminController::updateStatus — the controller-side
 * payment_status state-machine guard that returns 422 when an
 * admin attempts an illegal transition.
 *
 * The PaymentStatus enum's allowedTransitions() is already tested
 * directly via Tests\Unit\Enums\PaymentStatusTest. This file
 * exercises the CONTROLLER INTEGRATION: the 422 response shape,
 * the hint messages that point admin at the right action, and the
 * actual mirror update on legal transitions.
 *
 * Coverage:
 *
 *   422 illegal-transition guard:
 *     - paid → pending → 422 with refund-button hint
 *     - refunded → anything → 422 with "terminal" hint
 *     - Any other illegal pair → 422 with allowed[] list
 *
 *   Successful transitions (no DB writes for the failed ones —
 *   only legal moves actually update the row):
 *     - Same status returns OK (no transition needed)
 *     - paid → refunded is legal → mirror updated
 *     - open → pending is legal
 *     - pending → paid is legal
 *
 *   Unknown current_status:
 *     - 422 with "Cannot transition" error
 *
 *   Direct controller invocation (no auth middleware) — keeps the
 *   test focused on the state-machine contract without coupling
 *   to Sanctum / route registration / SaasAuthMiddleware. The
 *   logic being tested has zero dependencies on the request user
 *   or session.
 */
class BookingAdminControllerStateMachineTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private BookingAdminController $controller;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingAdminSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->controller = new BookingAdminController();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    private function callUpdateStatus(int $mirrorId, array $payload)
    {
        // Build a Request with the payload via attributes()->add() so
        // it bypasses the input pipeline; updateStatus calls
        // $request->validate() which reads from all input sources.
        $request = Request::create('/test', 'PATCH', $payload);
        return $this->controller->updateStatus($request, $mirrorId);
    }

    public function test_paid_to_pending_returns_422_with_refund_button_hint(): void
    {
        // The canonical state-machine violation. An admin trying to
        // "undo" a payment by reverting paid → pending instead of
        // issuing a refund must hit the 422 guard with a hint that
        // points them at the right action.
        $mirror = BookingMirrorFactory::new()->paid()->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Pending->value,
        ]);

        $this->assertSame(422, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);
        $this->assertStringContainsString('Cannot move payment_status', $body['error']);
        $this->assertStringContainsString('Use the Refund button', $body['hint'],
            'paid → pending must surface the refund-button hint.');
        $this->assertIsArray($body['allowed']);
        // mirror in DB must NOT have been changed.
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Paid->value, $mirror->payment_status);
    }

    public function test_refunded_to_anything_returns_422_with_terminal_hint(): void
    {
        // Refunded is the terminal state per the enum's
        // allowedTransitions(). The hint must explain that
        // "issue a new charge" is the recovery path.
        $mirror = BookingMirrorFactory::new()->refunded()->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Paid->value,
        ]);

        $this->assertSame(422, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);
        $this->assertStringContainsString('Refunded is terminal', $body['hint']);
    }

    public function test_illegal_transition_response_includes_allowed_list(): void
    {
        // The 422 body carries the allowed[] list so the SPA can
        // render the legal next-states for the admin without
        // round-tripping to the enum's API.
        $mirror = BookingMirrorFactory::new()->paid()->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => 'open',  // paid → open is illegal
        ]);

        $this->assertSame(422, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);
        $this->assertArrayHasKey('allowed', $body);
        $this->assertIsArray($body['allowed']);
        // From the enum: paid → [partially_refunded, refunded, disputed]
        $this->assertContains(PaymentStatus::PartiallyRefunded->value, $body['allowed']);
        $this->assertContains(PaymentStatus::Refunded->value, $body['allowed']);
        $this->assertContains(PaymentStatus::Disputed->value, $body['allowed']);
    }

    public function test_unknown_current_payment_status_returns_422(): void
    {
        // Defensive guard: if a mirror has a payment_status we
        // don't recognise (legacy data, schema drift, manual DB
        // tinkering), the transition request must NOT silently
        // succeed. Return 422 with a clear "unknown" message so
        // the admin can fix the underlying state first.
        $mirror = BookingMirrorFactory::new()->create([
            'payment_status' => 'sometypo',
        ]);

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Paid->value,
        ]);

        $this->assertSame(422, $response->getStatusCode());
        $body = json_decode($response->getContent(), true);
        $this->assertStringContainsString("Unknown current payment_status 'sometypo'",
            $body['error']);
    }

    public function test_same_status_is_a_noop_and_does_not_throw(): void
    {
        // Status didn't actually change → the state-machine guard
        // short-circuits without checking transitions. Status
        // stays the same; the controller falls through to the
        // (no-op) update + show() return.
        $mirror = BookingMirrorFactory::new()->paid()->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Paid->value,
        ]);

        // Successful response (200 default).
        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Paid->value, $mirror->payment_status);
    }

    public function test_legal_paid_to_refunded_updates_the_mirror(): void
    {
        // Happy path: paid → refunded is in the allowed list per
        // the enum. Mirror must end up with the new status.
        $mirror = BookingMirrorFactory::new()->paid()->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Refunded->value,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Refunded->value, $mirror->payment_status);
    }

    public function test_legal_open_to_pending_updates_the_mirror(): void
    {
        // Another canonical legal transition from the enum's
        // allowedTransitions(). Locks the state-machine chain
        // open → pending → paid that drives every Stripe-flow
        // booking.
        $mirror = BookingMirrorFactory::new()->create([
            'payment_status' => PaymentStatus::Open->value,
        ]);

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Pending->value,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Pending->value, $mirror->payment_status);
    }

    public function test_legal_pending_to_paid_updates_the_mirror(): void
    {
        // Stripe confirm path: pending → paid is the canonical
        // forward step.
        $mirror = BookingMirrorFactory::new()->create([
            'payment_status' => PaymentStatus::Pending->value,
        ]);

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Paid->value,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Paid->value, $mirror->payment_status);
    }

    public function test_disputed_to_paid_allowed_via_enum(): void
    {
        // Dispute resolved in our favour (Stripe won the dispute)
        // → mirror moves back to paid. Lock this specific
        // resolution path that staff use when ops resolves a
        // chargeback in our favour.
        $mirror = BookingMirrorFactory::new()->disputed()->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Paid->value,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Paid->value, $mirror->payment_status);
    }

    public function test_partially_refunded_to_refunded_allowed(): void
    {
        // The "we tried a partial refund, now upgrading to full"
        // path. Enum allows it.
        $mirror = BookingMirrorFactory::new()->partiallyRefunded(50.0)->create();

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status' => PaymentStatus::Refunded->value,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Refunded->value, $mirror->payment_status);
    }

    public function test_other_fields_can_update_alongside_payment_status(): void
    {
        // Multi-field update: payment_status legal change PLUS
        // internal_status string PLUS price_paid number — all
        // applied atomically via the controller's
        // array_filter(non-null) pattern.
        $mirror = BookingMirrorFactory::new()->create([
            'payment_status'   => PaymentStatus::Pending->value,
            'internal_status'  => 'pending_pms_sync',
            'price_paid'       => 0,
        ]);

        $response = $this->callUpdateStatus($mirror->id, [
            'payment_status'  => PaymentStatus::Paid->value,
            'internal_status' => 'confirmed',
            'price_paid'      => 500.00,
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Paid->value, $mirror->payment_status);
        $this->assertSame('confirmed', $mirror->internal_status);
        $this->assertSame(500.00, (float) $mirror->price_paid);
    }

    public function test_null_payment_status_in_payload_does_not_trigger_state_machine(): void
    {
        // Null/absent payment_status in the payload means "don't
        // change it" — must NOT trigger the state-machine guard.
        // Other fields can still update.
        $mirror = BookingMirrorFactory::new()->paid()->create([
            'internal_status' => 'pending_pms_sync',
        ]);

        $response = $this->callUpdateStatus($mirror->id, [
            'internal_status' => 'confirmed',
        ]);

        $this->assertSame(200, $response->getStatusCode());
        $mirror->refresh();
        $this->assertSame(PaymentStatus::Paid->value, $mirror->payment_status,
            'payment_status must be unchanged when not in the payload.');
        $this->assertSame('confirmed', $mirror->internal_status);
    }
}
