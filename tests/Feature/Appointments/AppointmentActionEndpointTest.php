<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\LoyaltyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentActionEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function act(ServiceBooking $booking, string $action, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->postJson($this->api("bookings/{$booking->id}/actions"), array_merge([
            'action'   => $action,
            'revision' => AppointmentPresenter::revision($booking->fresh()),
        ], $extra));
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> from status, action, resulting status */
    public static function transitions(): array
    {
        return [
            'confirm a pending request' => ['pending', 'confirm', 'confirmed'],
            'client arrived'            => ['confirmed', 'start', 'in_progress'],
            'complete from confirmed'   => ['confirmed', 'complete', 'completed'],
            'complete from in progress' => ['in_progress', 'complete', 'completed'],
            'no-show'                   => ['confirmed', 'no_show', 'no_show'],
            'cancel'                    => ['in_progress', 'cancel', 'cancelled'],
        ];
    }

    #[DataProvider('transitions')]
    public function test_a_transition_writes_the_status_and_an_audit_row(string $from, string $action, string $to): void
    {
        $booking = $this->seedBooking(['status' => $from]);

        $this->act($booking, $action)->assertOk()->assertJsonPath('booking.status', $to);

        $this->assertSame($to, $booking->fresh()->status);
        $audit = AuditLog::where('subject_type', ServiceBooking::class)->where('subject_id', $booking->id)->firstOrFail();
        $this->assertSame("service_booking.{$action}", $audit->action);
        $this->assertSame($this->staff->id, (int) $audit->causer_id);
        $this->assertSame($from, $audit->old_values['status']);
        $this->assertSame($to, $audit->new_values['status']);
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function refused(): array
    {
        return [
            'complete a cancelled visit' => ['cancelled', 'complete'],
            'cancel a completed visit'   => ['completed', 'cancel'],
            'start a pending request'    => ['pending', 'start'],
            'no-show after it started'   => ['in_progress', 'no_show'],
            'confirm what is confirmed'  => ['confirmed', 'confirm'],
            'an action that is not one'  => ['confirmed', 'refund'],
            'move is not an action here' => ['confirmed', 'move'],
            'reopen a confirmed visit'   => ['confirmed', 'reopen'],
        ];
    }

    #[DataProvider('refused')]
    public function test_an_action_the_status_does_not_allow_is_refused(string $status, string $action): void
    {
        $booking = $this->seedBooking(['status' => $status]);

        $this->act($booking, $action)->assertStatus(422)->assertJsonPath('error', 'not_allowed');

        $this->assertSame($status, $booking->fresh()->status);
        $this->assertSame(0, AuditLog::where('subject_id', $booking->id)->count());
    }

    public function test_a_stale_action_is_refused(): void
    {
        $booking = $this->seedBooking();
        $seenByOperatorB = AppointmentPresenter::revision($booking->fresh());
        $booking->update(['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']); // operator A moved it

        $this->act($booking, 'cancel', ['revision' => $seenByOperatorB])
            ->assertStatus(409)->assertJsonPath('error', 'stale')->assertJsonPath('current.start', '2026-10-06T12:00');
        $this->assertSame('confirmed', $booking->fresh()->status);
    }

    public function test_cancel_stores_the_reason_and_the_time(): void
    {
        $booking = $this->seedBooking();

        $this->act($booking, 'cancel', ['reason' => str_repeat('r', 300)])->assertOk();

        $fresh = $booking->fresh();
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertSame(255, mb_strlen($fresh->cancellation_reason)); // the column holds 255
        $this->act($booking, 'cancel', ['reason' => str_repeat('r', 501)])->assertStatus(422);
    }

    public function test_cancel_never_touches_the_payment_fields(): void
    {
        $booking = $this->seedBooking(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_held_1']);

        $this->act($booking, 'cancel')->assertOk()
            ->assertJsonPath('booking.status', 'cancelled')
            ->assertJsonPath('booking.payment.state', 'card_held');

        $fresh = $booking->fresh();
        $this->assertSame('authorized', $fresh->payment_status);
        $this->assertSame('pi_held_1', $fresh->stripe_payment_intent_id);
        $this->assertNull($fresh->refunded_amount);
    }

    public function test_completing_a_members_visit_awards_points_once(): void
    {
        $booking = $this->seedBooking(['member_id' => $this->member->id]);

        $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('points', ['awarded' => 900, 'reason' => null])
            ->assertJsonPath('booking.loyalty.awarded', 900);

        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
        $this->assertSame(900, (int) $this->member->fresh()->current_points);
        $this->assertNotNull($booking->fresh()->points_awarded_at);

        // Completed is final here: a second press is refused and awards nothing.
        $this->act($booking, 'complete')->assertStatus(422);
        $this->act($booking, 'award_points')->assertStatus(422);
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_completing_a_non_members_visit_says_why_no_points(): void
    {
        $booking = $this->seedBooking();

        $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('booking.status', 'completed')
            ->assertJsonPath('points', ['awarded' => 0, 'reason' => 'not_a_member']);
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_a_failed_award_leaves_the_visit_completed_says_so_and_can_be_run_again(): void
    {
        // The ledger refuses the write (a real subclass, not a facade mock).
        $this->app->bind(LoyaltyService::class, fn () => new class extends LoyaltyService {
            public function awardPoints(LoyaltyMember $member, int $points, string $description, string $type = 'earn', ...$rest): PointsTransaction
            {
                throw new \RuntimeException('the ledger is not answering');
            }
        });
        $booking = $this->seedBooking(['member_id' => $this->member->id]);

        $failed = $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('booking.status', 'completed')
            ->assertJsonPath('points', ['awarded' => 0, 'reason' => 'failed']);

        $this->assertSame('completed', $booking->fresh()->status);
        $this->assertNull($booking->fresh()->points_awarded_at);
        $this->assertSame(0, PointsTransaction::where('member_id', $this->member->id)->count());
        $this->assertSame(0, (int) $this->member->fresh()->current_points);
        $this->assertTrue(collect($failed->json('booking.actions'))->firstWhere('key', 'award_points')['allowed']);

        // The ledger is back: the same worker, run again from the panel, awards once.
        $this->app->bind(LoyaltyService::class, fn () => new LoyaltyService());
        $this->act($booking, 'award_points')->assertOk()->assertJsonPath('points', ['awarded' => 900, 'reason' => null]);
        $this->assertSame(900, (int) $this->member->fresh()->current_points);
    }

    public function test_an_award_someone_else_made_first_is_reported_as_already_awarded(): void
    {
        // The full admin completes the same visit and awards between this
        // request's commit and its own award: the stamp is there, the worker
        // returns nothing. The answer must not claim "nothing was charged".
        $booking = $this->seedBooking(['member_id' => $this->member->id]);
        AuditLog::created(function (AuditLog $row) use ($booking) {
            if ($row->action === 'service_booking.complete') {
                DB::table('service_bookings')->where('id', $booking->id)->update(['points_awarded_at' => now()]);
            }
        });

        $this->act($booking, 'complete')->assertOk()
            ->assertJsonPath('booking.status', 'completed')
            ->assertJsonPath('points', ['awarded' => 0, 'reason' => 'already_awarded']);
        $this->assertSame(0, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_an_award_that_did_not_happen_can_be_run_again(): void
    {
        // Completed elsewhere (the award failed or never ran): unstamped, still due.
        $booking = $this->seedBooking(['status' => 'completed', 'member_id' => $this->member->id]);

        $this->act($booking, 'award_points')->assertOk()
            ->assertJsonPath('points', ['awarded' => 900, 'reason' => null])
            ->assertJsonPath('booking.status', 'completed');
        $this->act($booking, 'award_points')->assertStatus(422);
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_a_visit_booked_in_the_workspace_for_a_member_earns_on_completion(): void
    {
        $ada = $this->seedMemberClient();
        $id = $this->asStaff()->postJson($this->api('bookings'), [
            'client_id' => $ada->id, 'service_id' => $this->service->id, 'master_id' => $this->master->id, 'start' => '2026-10-06T10:00',
        ], ['Idempotency-Key' => (string) Str::uuid()])->assertStatus(201)->json('booking.id');

        $this->act(ServiceBooking::findOrFail($id), 'complete')->assertOk()->assertJsonPath('points.awarded', 900);
        $this->assertSame(900, (int) $this->member->fresh()->current_points);
    }

    public function test_another_organisations_appointment_cannot_be_acted_on(): void
    {
        $theirs = $this->inOrganization($this->otherOrganization()->id, fn () => $this->seedBooking());

        $this->asStaff()->postJson($this->api("bookings/{$theirs->id}/actions"), ['action' => 'cancel', 'revision' => 'x'])
            ->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
}
