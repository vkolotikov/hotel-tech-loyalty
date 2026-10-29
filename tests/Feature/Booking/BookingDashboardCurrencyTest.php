<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\Admin\BookingAdminController;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Exercises the production PostgreSQL aggregate syntax against the real migrations. */
class BookingDashboardCurrencyTest extends TestCase
{
    use DatabaseTransactions;

    private Organization $org;

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('Dashboard aggregates use PostgreSQL; run against the isolated migrated test database.');
        }
        $this->org = Organization::create(['name' => 'Currency test hotel', 'slug' => 'currency-dashboard-'.uniqid()]);
        app()->instance('current_organization_id', $this->org->id);
        HotelSetting::create(['key' => 'booking_currency', 'value' => 'CHF', 'type' => 'string', 'group' => 'booking', 'label' => 'Currency']);
    }

    private function booking(string $currency, float $total, float $paid, int $unit = 1): BookingMirror
    {
        return BookingMirror::create([
            'reservation_id' => 'CURRENCY-'.uniqid(), 'booking_state' => 'confirmed', 'guest_name' => 'Test guest',
            'apartment_id' => $unit, 'apartment_name' => 'Room', 'arrival_date' => now()->addDay()->toDateString(),
            'departure_date' => now()->addDays(3)->toDateString(), 'price_total' => $total, 'price_paid' => $paid,
            'payment_status' => 'pending', 'channel_name' => 'Website', 'raw_json' => ['currency' => $currency],
        ]);
    }

    private function dashboard(array $params = []): array
    {
        return app(BookingAdminController::class)->dashboard(new Request($params))->getData(true);
    }

    public function test_mixed_currency_money_is_never_summed_and_each_recent_row_keeps_its_snapshot(): void
    {
        $gbp = $this->booking('gbp', 100, 40);
        $usd = $this->booking('USD', 200, 50);
        $legacy = $this->booking('', 40, 10);
        $data = $this->dashboard();
        $kpis = collect($data['kpis'])->keyBy('key');
        $this->assertNull($kpis['revenue']['value']);
        $this->assertSame([['currency' => 'CHF', 'amount' => 40], ['currency' => 'GBP', 'amount' => 100], ['currency' => 'USD', 'amount' => 200]], $kpis['revenue']['values']);
        $this->assertSame([30, 60, 150], array_column($kpis['balance_due']['values'], 'amount'));
        $this->assertStringContainsString('GBP 100.00', $kpis['revenue']['displayValue']);
        $this->assertNull($data['analytics']['paymentMix'][0]['total']);
        $this->assertSame(3, $data['analytics']['paymentMix'][0]['count']);
        $this->assertCount(3, $data['analytics']['paymentMix'][0]['totals']);
        $this->assertSame(['CHF', 'GBP', 'USD'], array_column($data['analytics']['unitPerformance'], 'currency'));
        foreach (['arrivals', 'recentUnpaidBookings', 'websiteBookings'] as $key) {
            $rows = collect($data[$key])->keyBy('id');
            $this->assertSame('GBP', $rows[$gbp->id]['currency']);
            $this->assertSame('USD', $rows[$usd->id]['currency']);
            $this->assertArrayNotHasKey('raw_json', $rows[$gbp->id]);
        }
    }

    public function test_unit_period_and_tenant_filters_apply_to_every_monetary_aggregate(): void
    {
        $this->booking('GBP', 100, 40, 1);
        $this->booking('USD', 200, 50, 2);
        $old = $this->booking('EUR', 999, 0, 1);
        DB::table('booking_mirror')->where('id', $old->id)->update(['created_at' => now()->subYears(2)]);
        $foreign = $this->booking('EUR', 888, 0, 1);
        $other = Organization::create(['name' => 'Other hotel', 'slug' => 'currency-other-'.uniqid()]);
        DB::table('booking_mirror')->where('id', $foreign->id)->update(['organization_id' => $other->id]);

        $data = $this->dashboard(['unit_id' => 1, 'period' => 'week']);
        $kpis = collect($data['kpis'])->keyBy('key');
        $this->assertSame(100, $kpis['revenue']['value']);
        $this->assertSame([['currency' => 'GBP', 'amount' => 100]], $kpis['revenue']['values']);
        $this->assertSame(60, $kpis['balance_due']['value']);
        $this->assertSame(1, $kpis['total_bookings']['value']);
        $this->assertCount(1, $data['analytics']['unitPerformance']);
        $this->assertSame('GBP', $data['analytics']['unitPerformance'][0]['currency']);
        $this->assertSame(100, $data['analytics']['paymentMix'][0]['total']);
    }

    public function test_an_empty_dashboard_reports_zero_in_the_venues_currency(): void
    {
        $kpis = collect($this->dashboard()['kpis'])->keyBy('key');
        $this->assertSame([['currency' => 'CHF', 'amount' => 0]], $kpis['revenue']['values']);
        $this->assertSame(0, $kpis['revenue']['value']);
    }
}
