<?php

namespace Tests\Feature\Dashboard;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpCrmWorkspace;
use Tests\TestCase;

/**
 * The full admin dashboard's day-by-day figures (2026-11-09): aligned series for the period, totals against the period
 * before, this organisation's rows only, and a measure that cannot be read answering null instead of failing the rest.
 * The clock is the CRM suite's: Wednesday 4 November 2026, 10:00 UTC.
 */
class DashboardTrendsTest extends TestCase
{
    use DatabaseTransactions, SetsUpCrmWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCrmWorkspace();
    }

    private function bookingsTable(): void
    {
        if (!Schema::hasTable('bookings')) {
            Schema::create('bookings', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->decimal('total_amount', 10, 2)->default(0);
                $t->string('status')->nullable();
                $t->timestamps();
            });
        }
    }

    private function booking(string $at, float $amount, ?int $org = null): void
    {
        DB::table('bookings')->insert(['organization_id' => $org ?? $this->org->id, 'total_amount' => $amount, 'status' => 'confirmed', 'created_at' => $at, 'updated_at' => $at]);
    }

    public function test_a_week_of_aligned_days_with_the_week_before(): void
    {
        $this->bookingsTable();
        $this->booking('2026-11-04 08:00:00', 120);
        $this->booking('2026-11-04 09:30:00', 80);
        $this->booking('2026-11-01 12:00:00', 50);
        $this->booking('2026-10-27 12:00:00', 100);   // the week before
        $this->booking('2026-11-03 12:00:00', 999, \App\Models\Organization::create(['name' => 'Other', 'slug' => 'org-' . uniqid('', true)])->id);
        $this->lead(['created_at' => '2026-11-03 15:00:00']);
        $this->lead(['created_at' => '2026-11-03 16:00:00']);

        $this->asManager()->getJson($this->adminApi('dashboard/trends?days=7'))->assertOk()
            ->assertJsonPath('days', 7)
            ->assertJsonPath('from', '2026-10-29')
            ->assertJsonPath('to', '2026-11-04')
            ->assertJsonCount(7, 'dates')
            ->assertJsonPath('dates.6', '2026-11-04')
            ->assertJsonPath('series.revenue', [0, 0, 0, 50, 0, 0, 200])
            ->assertJsonPath('series.bookings', [0, 0, 0, 1, 0, 0, 2])
            ->assertJsonPath('totals.revenue.current', 250)
            ->assertJsonPath('totals.revenue.previous', 100)
            ->assertJsonPath('totals.revenue.change', 150)
            ->assertJsonPath('series.leads.5', 2)
            // No leads the week before: no change to speak of, not "+∞ %".
            ->assertJsonPath('totals.leads.change', null);
    }

    public function test_an_unknown_period_is_thirty_days(): void
    {
        $this->bookingsTable();
        $this->asStaffMember()->getJson($this->adminApi('dashboard/trends?days=1000'))->assertOk()
            ->assertJsonPath('days', 30)
            ->assertJsonCount(30, 'dates')
            ->assertJsonPath('dates.0', '2026-10-06');
    }

    public function test_a_measure_that_cannot_be_read_is_null_and_the_others_stand(): void
    {
        // No bookings table in this schema.
        $this->assertFalse(Schema::hasTable('bookings'));
        $this->lead(['created_at' => '2026-11-04 09:00:00']);

        $this->asManager()->getJson($this->adminApi('dashboard/trends?days=14'))->assertOk()
            ->assertJsonPath('series.revenue', null)
            ->assertJsonPath('totals.bookings', null)
            ->assertJsonPath('series.leads.13', 1)
            ->assertJsonPath('totals.leads.current', 1);
    }
}
