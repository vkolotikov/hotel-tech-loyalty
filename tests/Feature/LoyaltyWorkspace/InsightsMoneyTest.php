<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * The money members bring (release 4 part E, InsightsMoney): paid stays and paid appointments booked by members in
 * the period, in the venue's currency, beside what every booking brought. The clock is Monday 5 October 2026,
 * 09:00 UTC; the 30-day period is 6 September to 5 October; the venue is on UTC and prices in EUR.
 */
class InsightsMoneyTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, SetsUpServiceBookingSchema;

    private Service $facial;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpServiceBookingSchema();
        // The real booking_mirror's columns the figures read that the narrower test table lacks.
        foreach (['guest_id' => fn (Blueprint $t) => $t->unsignedBigInteger('guest_id')->nullable(), 'source_created_at' => fn (Blueprint $t) => $t->timestamp('source_created_at')->nullable()] as $column => $add) {
            if (!Schema::hasColumn('booking_mirror', $column)) {
                Schema::table('booking_mirror', $add);
            }
        }
        $this->org->forceFill(['currency' => 'EUR'])->save();
        $this->facial = Service::create(['name' => 'Facial', 'duration_minutes' => 60, 'price' => 80, 'currency' => 'EUR']);
    }

    private function money(string $query = ''): \Illuminate\Testing\TestResponse
    {
        return $this->asManager()->getJson($this->api('insights/money?brand_id=all' . ($query === '' ? '' : "&{$query}")))->assertOk();
    }

    private function stay(array $values, string $createdAt): int
    {
        return (int) DB::table('booking_mirror')->insertGetId($values + [
            'organization_id' => $this->org->id, 'reservation_id' => uniqid('R'), 'price_total' => $values['price_paid'] ?? 0,
            'created_at' => $createdAt, 'updated_at' => $createdAt,
        ]);
    }

    private function appointment(array $values, string $createdAt): ServiceBooking
    {
        $b = ServiceBooking::create($values + [
            'service_id' => $this->facial->id, 'customer_name' => 'Client', 'customer_email' => 'client@example.test',
            'start_at' => '2026-10-20 10:00:00', 'end_at' => '2026-10-20 11:00:00', 'duration_minutes' => 60,
            'total_amount' => 80, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid',
        ]);
        $b->forceFill(['created_at' => $createdAt])->save();

        return $b;
    }

    private function guestOf(?int $memberId, ?int $orgId = null): int
    {
        return (int) DB::table('guests')->insertGetId(['organization_id' => $orgId ?? $this->org->id, 'member_id' => $memberId, 'full_name' => 'A guest', 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_only_who_may_read_insights_reads_it_and_the_period_is_checked(): void
    {
        $this->asStaffMember()->getJson($this->api('insights/money'))
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed')->assertJsonPath('need', 'can_view_analytics');
        $this->asManager()->getJson($this->api('insights/money?period=7d'))->assertStatus(422)->assertJsonValidationErrors(['period']);
        $this->money()->assertJsonPath('period', '30d')->assertJsonPath('currency', 'EUR');
    }

    public function test_nothing_booked_answers_zeros_and_no_share(): void
    {
        $response = $this->money('period=90d')
            ->assertJsonPath('bucket', 'week')
            ->assertJsonPath('members', ['stays' => ['bookings' => 0, 'amount' => 0], 'services' => ['bookings' => 0, 'amount' => 0], 'total' => 0])
            ->assertJsonPath('all', ['total' => 0])
            ->assertJsonPath('share', null)
            ->assertJsonPath('other_currency', ['bookings' => 0]);
        $this->assertCount(13, $response->json('series'));
    }

    public function test_paid_stays_and_appointments_of_members_in_the_venues_currency_beside_every_bookings(): void
    {
        $ada = $this->ada->id;
        $graceGuest = $this->guestOf($this->grace->id);
        $other = $this->otherOrganization();

        // Stays.
        $this->stay(['member_id' => $ada, 'price_paid' => 300], '2026-10-01 10:00:00');
        $this->stay(['guest_id' => $graceGuest, 'price_paid' => 200, 'refunded_amount' => 50, 'source_created_at' => '2026-09-20 08:00:00'], '2026-10-03 10:00:00');
        $this->stay(['price_paid' => 500, 'guest_email' => $this->ada->user->email], '2026-10-02 10:00:00');      // the same email only: not a member's
        $this->stay(['member_id' => $ada, 'price_paid' => 100, 'refunded_amount' => 100], '2026-10-01 10:00:00'); // all of it went back
        $this->stay(['member_id' => $ada, 'price_paid' => null], '2026-10-01 10:00:00');                         // not paid
        $this->stay(['member_id' => $ada, 'price_paid' => 80, 'payment_method' => 'mock'], '2026-10-01 10:00:00'); // test mode
        $this->stay(['member_id' => $ada, 'price_paid' => 90], '2026-09-05 23:00:00');                          // booked before the period
        $this->stay(['member_id' => $other['member']->id, 'price_paid' => 40], '2026-10-01 10:00:00');           // names another organisation's member
        DB::table('booking_mirror')->insert(['organization_id' => $other['org']->id, 'reservation_id' => 'THEIRS', 'member_id' => $other['member']->id, 'price_paid' => 999, 'price_total' => 999, 'created_at' => '2026-10-01 10:00:00', 'updated_at' => '2026-10-01 10:00:00']);

        // Appointments.
        $this->appointment(['member_id' => $ada, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_live_1'], '2026-10-02 12:00:00');
        $desk = $this->appointment(['guest_id' => $graceGuest, 'total_amount' => 60], '2026-10-04 12:00:00');
        ServiceBookingPayment::create(['service_booking_id' => $desk->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 40, 'currency' => 'EUR']);
        $this->appointment(['payment_status' => 'paid', 'total_amount' => 60], '2026-10-04 12:00:00');            // not a member's
        $this->appointment(['member_id' => $ada, 'currency' => 'GBP', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_live_2'], '2026-10-04 12:00:00');
        $this->appointment(['member_id' => $ada], '2026-10-04 12:00:00');                                         // not paid
        $this->appointment(['member_id' => $ada, 'payment_status' => 'refunded', 'stripe_payment_intent_id' => 'pi_live_3', 'refunded_amount' => 80], '2026-10-04 12:00:00');
        $this->appointment(['member_id' => $ada, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_live_4'], '2026-09-05 12:00:00'); // before

        $response = $this->money();

        $response->assertJsonPath('members', [
            'stays'    => ['bookings' => 2, 'amount' => 450],
            'services' => ['bookings' => 2, 'amount' => 120],
            'total'    => 570,
        ])
            ->assertJsonPath('all', ['total' => 570 + 500 + 40 + 60])
            ->assertJsonPath('share', 48.7)
            ->assertJsonPath('other_currency', ['bookings' => 1]);
        $series = collect($response->json('series'))->keyBy('key');
        $this->assertSame(['key' => '2026-09-20', 'stays' => 150, 'services' => 0], $series['2026-09-20']);
        $this->assertSame(['key' => '2026-10-01', 'stays' => 300, 'services' => 0], $series['2026-10-01']);
        $this->assertSame(['key' => '2026-10-02', 'stays' => 0, 'services' => 80], $series['2026-10-02']);
        $this->assertSame(['key' => '2026-10-04', 'stays' => 0, 'services' => 40], $series['2026-10-04']);
        $this->assertSame(450.0, (float) $series->sum('stays'));
    }

    public function test_stays_priced_in_another_currency_are_counted_apart_and_a_venue_day_is_the_venues(): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'booking_currency', 'value' => 'USD', 'type' => 'string', 'group' => 'booking']);
        $this->stay(['member_id' => $this->ada->id, 'price_paid' => 300], '2026-10-01 10:00:00');
        $this->money()->assertJsonPath('members.stays', ['bookings' => 0, 'amount' => 0])->assertJsonPath('other_currency', ['bookings' => 1]);

        // Riga is three hours ahead: 22:30 UTC on 1 October is the 2nd there.
        DB::table('hotel_settings')->where('key', 'booking_currency')->delete();
        HotelSetting::flushCacheFor($this->org->id);
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->appointment(['member_id' => $this->ada->id, 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_live_9'], '2026-10-01 22:30:00');
        $series = collect($this->money()->assertJsonPath('timezone', 'Europe/Riga')->json('series'))->keyBy('key');
        $this->assertSame(80, (int) $series['2026-10-02']['services']);
        $this->assertSame(300, (int) $series['2026-10-01']['stays']);
    }
}
