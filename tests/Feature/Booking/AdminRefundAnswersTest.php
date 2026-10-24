<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Admin\BookingAdminController;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\Booking\RefundOutcomeUnknown;
use App\Services\BookingRefundService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Release 6 (review): what the full admin's "Issue refund" answers when Stripe did not answer in time — the refund may
 * have been made, so staff are told to retry only the same amount (504 `refund_outcome_unknown`) — and when Stripe
 * handed back a refund it had already made for this payment and amount instead of making a new one (409
 * `no_new_refund`). The refund itself is BookingRefundService's (RefundEventsOnceTest); here it is a double.
 */
class AdminRefundAnswersTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema;

    private int $id;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
        $org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $org->id);
        $this->id = (int) BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $org->id, 'reservation_id' => 'R-' . uniqid(), 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 200, 'payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_admin_1',
        ])->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function refundWith(BookingRefundService $service): \Illuminate\Http\JsonResponse
    {
        return app(BookingAdminController::class)->refund(Request::create('/', 'POST', ['amount' => 50]), $this->id, $service);
    }

    public function test_a_refund_stripe_did_not_answer_tells_staff_to_retry_only_the_same_amount(): void
    {
        $service = Mockery::mock(BookingRefundService::class);
        $service->shouldReceive('applyRefund')->once()->andThrow(new RefundOutcomeUnknown(RefundOutcomeUnknown::MESSAGE));

        $res = $this->refundWith($service);

        $this->assertSame(504, $res->getStatusCode());
        $this->assertSame('refund_outcome_unknown', $res->getData(true)['code']);
        $this->assertStringContainsString('use exactly the same amount', $res->getData(true)['error']);
    }

    public function test_a_refund_stripe_handed_back_says_no_new_refund_was_made(): void
    {
        $service = Mockery::mock(BookingRefundService::class);
        $service->shouldReceive('applyRefund')->once()->andReturn([
            'is_full' => false, 'refund_id' => 're_1', 'reversed_points' => 0, 'pms_cancelled' => false, 'email_sent' => false,
            'no_new_refund' => true, 'recorded_later' => false,
        ]);

        $res = $this->refundWith($service);

        $this->assertSame(409, $res->getStatusCode());
        $this->assertSame('no_new_refund', $res->getData(true)['code']);
        $this->assertStringStartsWith('No new refund was made', $res->getData(true)['error']);
        $this->assertStringContainsString('already recorded on this booking', $res->getData(true)['error']);
    }
}
