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
 * Runs on SQLite and on a PostgreSQL schema built from every migration (scripts/test-pg.sh); the two cases that need the
 * test's own SQLite tables say so and skip there.
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

    private function booking(string $at, float $amount): void
    {
        DB::table('bookings')->insert(['organization_id' => $this->org->id, 'total_amount' => $amount, 'status' => 'confirmed', 'created_at' => $at, 'updated_at' => $at]);
    }

    public function test_a_week_of_aligned_days_with_the_week_before(): void
    {
        $this->lead(['created_at' => '2026-11-04 08:00:00']);
        $this->lead(['created_at' => '2026-11-04 09:30:00']);
        $this->lead(['created_at' => '2026-11-01 12:00:00']);
        $this->lead(['created_at' => '2026-10-27 12:00:00']);   // the week before
        $this->chat(['created_at' => '2026-11-03 15:00:00']);
        $other = \App\Models\Organization::create(['name' => 'Other', 'slug' => 'org-' . uniqid('', true)]);
        DB::table('inquiries')->where('id', $this->lead(['created_at' => '2026-11-03 12:00:00']))->update(['organization_id' => $other->id]);

        $this->asManager()->getJson($this->adminApi('dashboard/trends?days=7'))->assertOk()
            ->assertJsonPath('days', 7)
            ->assertJsonPath('from', '2026-10-29')
            ->assertJsonPath('to', '2026-11-04')
            ->assertJsonCount(7, 'dates')
            ->assertJsonPath('dates.6', '2026-11-04')
            // Another organisation's lead (3 November) is not counted.
            ->assertJsonPath('series.leads', [0, 0, 0, 1, 0, 0, 2])
            ->assertJsonPath('totals.leads.current', 3)
            ->assertJsonPath('totals.leads.previous', 1)
            ->assertJsonPath('totals.leads.change', 200)
            ->assertJsonPath('series.chats.5', 1)
            // No chats the week before: no change to speak of, not "+∞ %".
            ->assertJsonPath('totals.chats.change', null);
    }

    public function test_revenue_is_the_bookings_total_by_the_day_they_were_made(): void
    {
        if (Schema::hasTable('bookings')) {
            // The migrated schema's bookings need a member, a tier and a user; this case is the SQLite schema's own.
            $this->markTestSkipped('Runs on the test\'s own SQLite bookings table.');
        }
        $this->bookingsTable();
        $this->booking('2026-11-04 08:00:00', 120);
        $this->booking('2026-11-04 09:30:00', 80);
        $this->booking('2026-11-01 12:00:00', 50);
        $this->booking('2026-10-27 12:00:00', 100);   // the week before

        $this->asManager()->getJson($this->adminApi('dashboard/trends?days=7'))->assertOk()
            ->assertJsonPath('series.revenue', [0, 0, 0, 50, 0, 0, 200])
            ->assertJsonPath('series.bookings', [0, 0, 0, 1, 0, 0, 2])
            ->assertJsonPath('totals.revenue.current', 250)
            ->assertJsonPath('totals.revenue.previous', 100)
            ->assertJsonPath('totals.revenue.change', 150);
    }

    public function test_every_measure_reads_on_the_migrated_schema(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->markTestSkipped('The SQLite schemas hold only some of the tables; scripts/test-pg.sh runs this on every migration.');
        }

        $response = $this->asManager()->getJson($this->adminApi('dashboard/trends?days=7'))->assertOk();
        foreach (['revenue', 'bookings', 'services', 'service_revenue', 'members', 'points_earned', 'points_redeemed', 'leads', 'chats'] as $measure) {
            $this->assertIsArray($response->json("series.{$measure}"), "{$measure} did not read on PostgreSQL");
            $this->assertCount(7, $response->json("series.{$measure}"));
        }
    }

    public function test_an_unknown_period_is_thirty_days(): void
    {
        $this->asStaffMember()->getJson($this->adminApi('dashboard/trends?days=1000'))->assertOk()
            ->assertJsonPath('days', 30)
            ->assertJsonCount(30, 'dates')
            ->assertJsonPath('dates.0', '2026-10-06');
    }

    public function test_a_measure_that_cannot_be_read_is_null_and_the_others_stand(): void
    {
        if (Schema::hasTable('bookings')) {
            $this->markTestSkipped('Every table exists in the migrated schema: nothing is left to be unreadable.');
        }
        $this->lead(['created_at' => '2026-11-04 09:00:00']);

        $this->asManager()->getJson($this->adminApi('dashboard/trends?days=14'))->assertOk()
            ->assertJsonPath('series.revenue', null)
            ->assertJsonPath('totals.bookings', null)
            ->assertJsonPath('series.leads.13', 1)
            ->assertJsonPath('totals.leads.current', 1);
    }
}
