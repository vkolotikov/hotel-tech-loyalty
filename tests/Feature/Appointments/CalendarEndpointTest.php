<?php

namespace Tests\Feature\Appointments;

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class CalendarEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function calendar(array $query): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('calendar') . '?' . http_build_query($query));
    }

    public function test_a_day_lists_team_members_with_their_working_windows(): void
    {
        $this->master->forceFill(['title' => 'Massage Therapist'])->save();
        DB::table('service_master_time_off')->insert([
            'organization_id' => $this->org->id, 'service_master_id' => $this->master->id,
            'date' => '2026-10-06', 'start_time' => '13:00:00', 'end_time' => '14:00:00', 'reason' => 'Lunch',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])
            ->assertOk()
            ->assertJsonPath('from', '2026-10-06')
            ->assertJsonPath('masters.0.id', $this->master->id)
            ->assertJsonPath('masters.0.name', 'Mara Ilves')
            ->assertJsonPath('masters.0.title', 'Massage Therapist')
            ->assertJsonPath('masters.0.days.2026-10-06.windows', [
                ['start' => '09:00', 'end' => '13:00'],
                ['start' => '14:00', 'end' => '17:00'],
            ])
            ->assertJsonPath('masters.0.days.2026-10-06.time_off', [
                ['start' => '13:00', 'end' => '14:00', 'reason' => 'Lunch'],
            ]);
    }

    public function test_a_window_ending_at_midnight_ends_at_24_00_not_00_00(): void
    {
        // The scheduler reads 24:00:00 as the next day's 00:00; the grid must still see the end of the day.
        DB::table('service_master_schedules')->where('service_master_id', $this->master->id)->update(['start_time' => '20:00:00', 'end_time' => '24:00:00']);

        $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])
            ->assertOk()
            ->assertJsonPath('masters.0.days.2026-10-06.windows', [['start' => '20:00', 'end' => '24:00']]);
    }

    public function test_appointments_come_as_wall_clock_summaries_in_time_order(): void
    {
        $late = $this->seedBooking(['start_at' => '2026-10-06 15:00:00', 'end_at' => '2026-10-06 15:45:00', 'staff_notes' => 'private']);
        $early = $this->seedBooking(['start_at' => '2026-10-06 09:00:00', 'end_at' => '2026-10-06 09:45:00']);
        $this->seedBooking(['start_at' => '2026-10-07 09:00:00', 'end_at' => '2026-10-07 09:45:00']);

        $response = $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])->assertOk();

        $this->assertSame([$early->id, $late->id], array_column($response->json('appointments'), 'id'));
        $response->assertJsonPath('appointments.0.start', '2026-10-06T09:00')
            ->assertJsonPath('appointments.0.end', '2026-10-06T09:45')
            ->assertJsonPath('appointments.0.client.name', 'Sophie Williams')
            ->assertJsonPath('appointments.0.payment.state', 'not_paid_online');
        $this->assertStringNotContainsString('private', $response->getContent());
        $this->assertArrayNotHasKey('notes', $response->json('appointments.0'));
    }

    public function test_cancelled_appointments_are_left_out_unless_asked_for(): void
    {
        $kept = $this->seedBooking();
        $cancelled = $this->seedBooking(['status' => 'cancelled', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $noShow = $this->seedBooking(['status' => 'no_show', 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $ids = fn (array $query) => array_column($this->calendar($query)->assertOk()->json('appointments'), 'id');

        $this->assertSame([$kept->id, $noShow->id], $ids(['from' => '2026-10-06', 'to' => '2026-10-06']));
        $this->assertSame([$kept->id, $cancelled->id, $noShow->id], $ids(['from' => '2026-10-06', 'to' => '2026-10-06', 'include_cancelled' => 1]));
    }

    public function test_another_organisations_appointments_never_appear(): void
    {
        $other = $this->otherOrganization();
        $theirs = $this->inOrganization($other->id, fn () => ServiceBooking::create([
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'customer_name' => 'Not Ours', 'customer_email' => '', 'start_at' => '2026-10-06 10:00:00', 'end_at' => '2026-10-06 10:45:00',
            'duration_minutes' => 45, 'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'admin',
        ]));
        $this->assertSame($other->id, (int) $theirs->organization_id);

        $this->assertSame([], $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])->assertOk()->json('appointments'));
    }

    public function test_the_catalogue_lists_active_services_with_the_active_people_who_perform_them(): void
    {
        $inactiveMaster = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Gone', 'is_active' => false]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $inactiveMaster->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        Service::create(['organization_id' => $this->org->id, 'name' => 'Retired', 'duration_minutes' => 30, 'price' => 10, 'is_active' => false]);

        $response = $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-06'])->assertOk();

        $this->assertCount(1, $response->json('services'));
        $response->assertJsonPath('services.0.name', 'Deep Tissue Massage')
            ->assertJsonPath('services.0.duration_minutes', 45)
            ->assertJsonPath('services.0.price', 60) // a whole amount arrives as an integer: json_encode drops the ".0"
            ->assertJsonPath('services.0.currency', 'EUR')
            ->assertJsonPath('services.0.master_ids', [$this->master->id]);
        $this->assertCount(1, $response->json('masters'));
    }

    public function test_a_week_for_one_person_computes_only_that_persons_windows(): void
    {
        $second = ServiceMaster::create(['organization_id' => $this->org->id, 'name' => 'Second', 'is_active' => true]);

        $masters = collect($this->calendar(['from' => '2026-10-05', 'to' => '2026-10-11', 'master_id' => $this->master->id])->assertOk()->json('masters'))->keyBy('id');

        $this->assertCount(7, $masters[$this->master->id]['days']);
        $this->assertSame([], $masters[$second->id]['days']);
    }

    public function test_a_caller_that_draws_no_grid_can_leave_the_working_windows_out(): void
    {
        // The list view shows appointments only. Windows cost two queries per
        // person per day, so a week for the whole team is asked for without them.
        $week = ['from' => '2026-10-05', 'to' => '2026-10-11'];

        $this->assertCount(7, $this->calendar($week)->assertOk()->json('masters.0.days'));
        $this->assertCount(7, $this->calendar($week + ['windows' => 1])->assertOk()->json('masters.0.days'));

        $without = $this->calendar($week + ['windows' => 0])->assertOk();
        $this->assertSame([], $without->json('masters.0.days'));
        $this->assertSame((int) $this->master->id, $without->json('masters.0.id')); // the people are still listed

        $this->calendar($week + ['windows' => 'sometimes'])->assertStatus(422);
    }

    public function test_a_long_range_carries_no_windows_and_a_too_long_one_is_refused(): void
    {
        $this->assertSame([], $this->calendar(['from' => '2026-10-01', 'to' => '2026-10-31'])->assertOk()->json('masters.0.days'));

        $this->calendar(['from' => '2026-10-01', 'to' => '2026-11-01'])->assertStatus(422)->assertJsonPath('error', 'range_too_long');
        $this->calendar(['from' => '2026-10-06', 'to' => '2026-10-05'])->assertStatus(422);
        $this->calendar(['from' => 'today', 'to' => '2026-10-05'])->assertStatus(422);
    }

    private function slots(array $query): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api('slots') . '?' . http_build_query($query));
    }

    public function test_slots_are_the_schedulers_free_starts_with_the_price_and_duration(): void
    {
        $this->seedBooking(); // 10:00–10:45 tomorrow

        $response = $this->slots(['service_id' => $this->service->id, 'master_id' => $this->master->id, 'date' => '2026-10-06'])->assertOk();
        $labels = array_column($response->json('slots'), 'label');

        $this->assertContains('09:00', $labels);
        $this->assertNotContains('10:00', $labels);
        $this->assertNotContains('10:30', $labels);
        $this->assertContains('10:45', $labels);
        $this->assertSame(['start' => '2026-10-06T09:00', 'end' => '2026-10-06T09:45', 'label' => '09:00'], $response->json('slots.0'));
        $response->assertJsonPath('duration_minutes', 45)->assertJsonPath('price', 60)->assertJsonPath('currency', 'EUR');
    }

    public function test_slots_for_a_move_offer_the_appointments_own_time(): void
    {
        $booking = $this->seedBooking();
        $query = ['service_id' => $this->service->id, 'master_id' => $this->master->id, 'date' => '2026-10-06'];

        $this->assertNotContains('10:00', array_column($this->slots($query)->json('slots'), 'label'));
        $this->assertContains('10:00', array_column($this->slots($query + ['ignore' => $booking->id])->json('slots'), 'label'));
    }

    public function test_staff_may_book_earlier_today_but_never_a_day_that_has_passed(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00'));
        $query = ['service_id' => $this->service->id, 'master_id' => $this->master->id];

        // A walk-in who started at 09:00 is recorded at noon.
        $this->assertContains('09:00', array_column($this->slots($query + ['date' => '2026-10-05'])->assertOk()->json('slots'), 'label'));
        $this->assertSame([], $this->slots($query + ['date' => '2026-10-04'])->assertOk()->json('slots'));
    }

    public function test_slots_for_an_unknown_service_or_person_answer_404(): void
    {
        $this->slots(['service_id' => 999999, 'master_id' => $this->master->id, 'date' => '2026-10-06'])
            ->assertStatus(404)->assertJsonPath('error', 'service_not_found');
        $this->slots(['service_id' => $this->service->id, 'master_id' => 999999, 'date' => '2026-10-06'])
            ->assertStatus(404)->assertJsonPath('error', 'master_not_found');
    }
}
