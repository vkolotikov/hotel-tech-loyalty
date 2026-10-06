<?php

namespace Tests\Feature\Appointments;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Models\ServiceMaster;
use App\Services\Appointments\Insights\InsightsPeriod;
use App\Services\Appointments\Insights\InsightsReport;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * Part G: a manager's view of how the venue is doing. The clock is Monday
 * 5 October 2026, 06:00 UTC; "last week" is 28 September – 4 October.
 */
class InsightsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function insights(string $from, string $to): \Illuminate\Testing\TestResponse
    {
        return $this->asStaff()->getJson($this->api("insights?from={$from}&to={$to}"));
    }

    private function pay(ServiceBooking $b, string $kind, string $method, float $amount, bool $corrects = false, string $currency = 'EUR'): void
    {
        ServiceBookingPayment::create([
            'service_booking_id' => $b->id, 'kind' => $kind, 'method' => $method, 'amount' => $amount, 'currency' => $currency,
            'note' => $kind === 'refund' ? 'test' : null, 'corrects' => $corrects, 'actor_user_id' => $this->staff->id,
        ]);
    }

    private function at(string $start, array $attrs = []): ServiceBooking
    {
        $end = CarbonImmutable::parse($start)->addMinutes(45)->format('Y-m-d H:i:s');

        return $this->seedBooking(['start_at' => $start, 'end_at' => $end] + $attrs);
    }

    private function setCancelHours(int $hours): void
    {
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = 'services_cancel_hours';
        $row->value = (string) $hours;
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
    }

    private function setZone(string $zone): void
    {
        $this->org->update(['timezone' => $zone]);
        app()->forgetScopedInstances();
    }

    public function test_only_a_manager_may_see_insights(): void
    {
        $this->actingAs($this->staffUser($this->org, ['role' => 'staff']), 'sanctum')
            ->getJson($this->api('insights?from=2026-09-28&to=2026-10-04'))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');
    }

    public function test_a_bad_period_is_refused_with_its_own_words(): void
    {
        foreach (['from=2026-10-12&to=2026-10-11', 'from=2026-01-01&to=2027-01-02', 'from=2026-02-30&to=2026-03-02', 'to=2026-10-11'] as $query) {
            $this->asStaff()->getJson($this->api("insights?{$query}"))
                ->assertStatus(422)->assertJsonPath('error', 'invalid_period')
                ->assertJsonPath('message', 'Choose a period of up to a year.');
        }
    }

    public function test_every_appointment_lands_in_one_group_and_the_money_is_the_panels_own(): void
    {
        $a = $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'payment_status' => 'paid']);
        $this->pay($a, 'payment', 'cash', 60);                                                      // done, paid at the desk
        $this->at('2026-09-29 10:00:00', ['status' => 'completed']);                                // done, still owed 60
        $this->at('2026-09-30 10:00:00', ['status' => 'no_show', 'payment_status' => 'paid',
            'stripe_payment_intent_id' => 'pi_live1', 'source' => 'widget']);                       // no-show, card deposit kept
        $this->at('2026-10-01 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-10-01 08:00:00', 'source' => 'google']);       // 2 h before: late
        $this->at('2026-10-02 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-30 09:00:00', 'source' => 'member_portal']); // 49 h before: in time
        $this->at('2026-10-03 10:00:00', ['status' => 'cancelled', 'cancelled_at' => null, 'source' => '']);                              // no time: in time
        $this->at('2026-10-04 10:00:00', ['status' => 'confirmed']);                                // passed, not marked
        $h = $this->at('2026-10-04 12:00:00', ['status' => 'completed', 'total_amount' => 54, 'discount_amount' => 6]);
        $this->pay($h, 'payment', 'card_desk', 54);
        $this->pay($h, 'refund', 'card_desk', 54, corrects: true);                                  // entered by mistake: owed again
        $this->at('2026-10-05 10:00:00', ['status' => 'completed']);                                // the day after the period: not counted

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('period', ['from' => '2026-09-28', 'to' => '2026-10-04', 'days' => 7])
            ->assertJsonPath('previous', ['from' => '2026-09-21', 'to' => '2026-09-27', 'days' => 7])
            ->assertJsonPath('cancel_hours', 24)
            ->assertJsonPath('desk_ledger_since', '2026-10-05')
            ->assertJsonPath('now', '2026-10-05T06:00')
            ->assertJsonPath('current.groups', ['done' => 3, 'no_show' => 1, 'unmarked' => 1, 'late_cancel' => 1, 'early_cancel' => 2, 'ahead' => 0])
            ->assertJsonPath('current.due', 6)
            ->assertJsonPath('current.money.EUR', ['done' => 3, 'value_done' => 174, 'taken' => 120, 'owed_done' => 114])
            ->assertJsonPath('current.main_currency', 'EUR')
            ->assertJsonPath('current.sources', ['online' => 3, 'desk' => 4, 'other' => 1])
            ->assertJsonPath('before.due', 0)
            ->assertJsonPath('before.main_currency', null);
    }

    public function test_a_held_card_is_not_money_taken_and_a_label_marked_paid_before_part_e_is(): void
    {
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_live2']);
        $this->at('2026-09-29 10:00:00', ['status' => 'completed', 'payment_status' => 'paid']); // marked paid, nothing recorded

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.money.EUR.taken', 60)
            ->assertJsonPath('current.money.EUR.value_done', 120);
    }

    public function test_the_window_is_the_venue_setting(): void
    {
        $this->setCancelHours(48);
        $this->at('2026-10-02 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-30 12:00:00']); // 46 h before

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('cancel_hours', 48)
            ->assertJsonPath('current.groups.late_cancel', 1);
    }

    public function test_late_is_measured_on_the_venue_clock(): void
    {
        $this->setZone('Europe/Riga');
        // 10:00 in Riga is 07:00 UTC; cancelled at 08:30 UTC the day before = 22.5 real hours ahead: late.
        // Reading the digits as UTC would make it 25.5 hours: in time.
        $this->at('2026-10-01 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-30 08:30:00']);

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.groups.late_cancel', 1)
            ->assertJsonPath('current.groups.early_cancel', 0);
    }

    public function test_the_period_is_the_venue_days_from_midnight_to_midnight(): void
    {
        $this->setZone('Europe/Riga');
        $this->at('2026-09-28 00:30:00', ['status' => 'completed']);
        $this->at('2026-10-04 23:30:00', ['status' => 'completed']);
        $this->at('2026-10-05 00:00:00', ['status' => 'completed']);
        $this->at('2026-09-27 23:59:00', ['status' => 'completed']);

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.groups.done', 2)
            ->assertJsonPath('before.groups.done', 1);
    }

    public function test_rows_by_service_and_by_person_with_no_one_assigned_and_a_removed_service(): void
    {
        $haircut = Service::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'name' => 'Haircut', 'duration_minutes' => 30, 'buffer_after_minutes' => 0,
            'price' => 40, 'currency' => 'EUR', 'is_active' => false,
        ]);
        $this->at('2026-09-28 10:00:00', ['status' => 'completed']);                                    // Massage, Mara, 60
        $this->at('2026-09-29 10:00:00', ['status' => 'no_show']);                                      // Massage, Mara
        $this->at('2026-09-30 10:00:00', ['status' => 'completed', 'service_id' => $haircut->id,
            'service_master_id' => null, 'total_amount' => 40]);                                         // Haircut, no one, 40
        $this->at('2026-10-01 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-10-01 09:00:00',
            'service_id' => $haircut->id, 'service_master_id' => null]);                                 // Haircut, no one, late
        $this->at('2026-10-02 10:00:00', ['status' => 'completed', 'service_id' => 999999, 'total_amount' => 30]); // removed service, Mara
        $this->at('2026-10-03 10:00:00', ['status' => 'cancelled', 'cancelled_at' => '2026-09-01 09:00:00',
            'service_id' => 999998]);                                                                    // in time only: no row

        $res = $this->insights('2026-09-28', '2026-10-04')->assertOk();
        $this->assertSame([
            ['id' => $this->service->id, 'name' => 'Deep Tissue Massage', 'due' => 2, 'done' => 1, 'no_show' => 1, 'late_cancel' => 0, 'value_done' => ['EUR' => 60]],
            ['id' => $haircut->id, 'name' => 'Haircut', 'due' => 2, 'done' => 1, 'no_show' => 0, 'late_cancel' => 1, 'value_done' => ['EUR' => 40]],
            ['id' => 999999, 'name' => null, 'due' => 1, 'done' => 1, 'no_show' => 0, 'late_cancel' => 0, 'value_done' => ['EUR' => 30]],
        ], $res->json('current.by_service'));
        $this->assertSame([
            ['id' => $this->master->id, 'name' => 'Mara Ilves', 'due' => 3, 'done' => 2, 'no_show' => 1, 'late_cancel' => 0, 'value_done' => ['EUR' => 90]],
            ['id' => null, 'name' => null, 'due' => 2, 'done' => 1, 'no_show' => 0, 'late_cancel' => 1, 'value_done' => ['EUR' => 40]],
        ], $res->json('current.by_person'));
    }

    public function test_money_is_kept_per_currency_and_the_main_currency_has_the_most_visits_done(): void
    {
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'currency' => 'USD', 'total_amount' => 100]);
        $this->at('2026-09-29 10:00:00', ['status' => 'completed', 'currency' => 'EUR']);
        $this->at('2026-09-30 10:00:00', ['status' => 'completed', 'currency' => 'EUR']);

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.main_currency', 'EUR')
            ->assertJsonPath('current.money.EUR', ['done' => 2, 'value_done' => 120, 'taken' => 0, 'owed_done' => 120])
            ->assertJsonPath('current.money.USD', ['done' => 1, 'value_done' => 100, 'taken' => 0, 'owed_done' => 100])
            ->assertJsonPath('current.by_service.0.value_done', ['EUR' => 120, 'USD' => 100]);
    }

    public function test_a_currency_with_no_visit_done_and_no_money_is_not_listed(): void
    {
        // The browser check: one booked-ahead booking in dollars drew "$0.00" in every money tile.
        $this->at('2026-09-28 10:00:00', ['status' => 'completed']);
        $this->at('2026-10-06 10:00:00', ['status' => 'confirmed', 'currency' => 'USD', 'total_amount' => 35]);
        $kept = $this->at('2026-10-01 10:00:00', ['status' => 'no_show', 'currency' => 'GBP', 'total_amount' => 20]);
        $this->pay($kept, 'payment', 'cash', 20, currency: 'GBP'); // a no-show's deposit kept: money taken, so listed

        $res = $this->insights('2026-09-28', '2026-10-11')->assertOk();
        $this->assertSame(['EUR', 'GBP'], array_keys($res->json('current.money')));
        $this->assertSame(['done' => 0, 'value_done' => 0, 'taken' => 20, 'owed_done' => 0], $res->json('current.money.GBP'));
    }

    public function test_a_calendar_month_is_compared_with_the_month_before(): void
    {
        $this->at('2026-08-14 10:00:00', ['status' => 'completed']);
        $this->at('2026-09-14 10:00:00', ['status' => 'completed']);
        $this->at('2026-09-15 10:00:00', ['status' => 'no_show']);

        $this->insights('2026-09-01', '2026-09-30')->assertOk()
            ->assertJsonPath('previous', ['from' => '2026-08-01', 'to' => '2026-08-31', 'days' => 31])
            ->assertJsonPath('current.due', 2)
            ->assertJsonPath('before.groups.done', 1);
    }

    public function test_a_reopened_visit_counts_by_what_it_is_now(): void
    {
        $this->at('2026-10-06 10:00:00', ['status' => 'confirmed', 'cancelled_at' => null]);

        $this->insights('2026-10-05', '2026-10-11')->assertOk()
            ->assertJsonPath('current.groups.ahead', 1)
            ->assertJsonPath('current.due', 0);
    }

    public function test_every_brand_counts_and_another_organisation_never_does(): void
    {
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'brand_id' => 5]);
        $this->at('2026-09-29 10:00:00', ['status' => 'completed', 'brand_id' => 6]);
        $other = $this->otherOrganization();
        $this->inOrganization($other->id, function () use ($other) {
            $b = ServiceBooking::create([
                'organization_id' => $other->id, 'service_id' => $this->service->id, 'customer_name' => 'Elsewhere', 'customer_email' => '',
                'start_at' => '2026-09-28 11:00:00', 'end_at' => '2026-09-28 11:45:00', 'duration_minutes' => 45,
                'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'completed', 'payment_status' => 'paid', 'source' => 'admin',
            ]);
            ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 60, 'currency' => 'EUR']);
        });

        app()->instance('current_brand_id', 5);
        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.groups.done', 2)
            ->assertJsonPath('current.money.EUR.taken', 0);
    }

    public function test_money_given_back_is_not_money_taken(): void
    {
        // Final review: no test gave money back, so dropping paid_back from "money taken" kept every test green.
        $this->at('2026-09-28 10:00:00', ['status' => 'completed', 'payment_status' => 'partially_refunded',
            'stripe_payment_intent_id' => 'pi_live9', 'refunded_amount' => 20]);   // 60 by card, 20 back through Stripe
        $desk = $this->at('2026-09-29 10:00:00', ['status' => 'completed']);
        $this->pay($desk, 'payment', 'cash', 60);
        $this->pay($desk, 'refund', 'cash', 15);                                  // a goodwill refund at the desk

        $this->insights('2026-09-28', '2026-10-04')->assertOk()
            ->assertJsonPath('current.money.EUR', ['done' => 2, 'value_done' => 120, 'taken' => 85, 'owed_done' => 0]);
    }

    public function test_a_long_period_is_counted_without_holding_every_appointment(): void
    {
        // Final review: each appointment held as a model costs ~3.4 KB; a busy venue's year would pass a 128 MB limit.
        $rows = [];
        foreach (range(0, 3999) as $i) {
            $start = CarbonImmutable::parse('2025-10-06 09:00:00')->addDays($i % 360)->addHours($i % 8);
            $rows[] = [
                'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
                'booking_reference' => 'SVC-M' . $i, 'customer_name' => 'Client ' . $i, 'customer_email' => '',
                'start_at' => $start->format('Y-m-d H:i:s'), 'end_at' => $start->addMinutes(45)->format('Y-m-d H:i:s'),
                'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR',
                'status' => $i % 9 === 0 ? 'cancelled' : 'completed', 'payment_status' => 'unpaid', 'source' => 'admin',
                'created_at' => now(), 'updated_at' => now(),
            ];
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('service_bookings')->insert($chunk);
        }
        unset($rows, $chunk);
        // Warm up classes, the zone and the setting, so only the counting is measured.
        InsightsReport::for($this->org->id, InsightsPeriod::fromInput('2026-10-01', '2026-10-01'), CarbonImmutable::now());
        gc_collect_cycles();

        $base = memory_get_usage();
        memory_reset_peak_usage();
        $report = InsightsReport::for($this->org->id, InsightsPeriod::fromInput('2025-10-05', '2026-10-04'), CarbonImmutable::now());
        $grew = memory_get_peak_usage() - $base;

        $this->assertSame(4000, array_sum($report['current']['groups']));
        $this->assertLessThan(6 * 1024 * 1024, $grew, sprintf('counting 4,000 appointments held %.1f MB at its peak', $grew / 1048576));
    }

    public function test_a_year_answers_in_a_fixed_number_of_queries(): void
    {
        $rows = [];
        foreach (range(0, 299) as $i) {
            $day = CarbonImmutable::parse('2025-10-06 10:00:00')->addDays($i);
            $rows[] = [
                'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
                'booking_reference' => 'SVC-Y' . $i, 'customer_name' => 'Client ' . $i, 'customer_email' => '', 'start_at' => $day->format('Y-m-d H:i:s'),
                'end_at' => $day->addMinutes(45)->format('Y-m-d H:i:s'), 'duration_minutes' => 45, 'service_price' => 60,
                'total_amount' => 60, 'currency' => 'EUR', 'status' => $i % 7 === 0 ? 'no_show' : 'completed',
                'payment_status' => 'unpaid', 'source' => 'admin', 'created_at' => now(), 'updated_at' => now(),
            ];
        }
        DB::table('service_bookings')->insert($rows);
        app()->forgetScopedInstances();
        HotelSetting::flushCacheFor($this->org->id);

        DB::enableQueryLog();
        $report = InsightsReport::for($this->org->id, InsightsPeriod::fromInput('2025-10-05', '2026-10-04'), CarbonImmutable::now());
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame(300, array_sum($report['current']['groups']));
        $this->assertLessThanOrEqual(10, $queries, "InsightsReport::for ran {$queries} queries");
    }
}
