<?php

namespace Tests\Feature\Widget;

use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 6, item 4: an "any staff member" confirm (`svc:{service}`) and a
 * confirm naming a master (`svcm:{master}`) serialise — the any-confirm also
 * takes the `svcm:` lock of every master it may pick, ascending, before it
 * checks any (the scheduler's lockCandidates(), inside the confirm's
 * transaction). On PostgreSQL the test reads the advisory locks the public
 * services confirm actually takes; on sqlite (no advisory locks) it checks the
 * booking is written as before. The order in the source is pinned by
 * tests/Unit/Booking/LockOrderTest.php.
 */
class AnyMasterSlotLockTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema;

    private Organization $org;
    private Service $service;
    private ServiceMaster $first;
    private ServiceMaster $second;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->org = $this->tenant();
        ['service' => $this->service, 'master' => $this->first] = $this->seedBookableService($this->org->id);
        $this->second = ServiceMaster::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'name' => 'Ott Kask', 'is_active' => true]);
        DB::table('service_master_service')->insert([
            'organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->second->id,
            'price_override' => null, 'duration_override_minutes' => null, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (range(0, 6) as $day) {
            DB::table('service_master_schedules')->insert([
                'organization_id' => $this->org->id, 'service_master_id' => $this->second->id, 'day_of_week' => $day,
                'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
        Mail::fake();
    }

    /** @return array{0: \Illuminate\Testing\TestResponse, 1: list<string>} the response and the advisory locks taken, in order */
    private function confirm(?int $masterId): array
    {
        $locks = [];
        DB::listen(function ($q) use (&$locks) {
            if (str_contains($q->sql, 'pg_advisory_xact_lock')) {
                $locks[] = (string) $q->bindings[0];
            }
        });
        $this->flushHeaders();
        $res = $this->withHeader('Idempotency-Key', 'widget-' . uniqid('', true))
            ->postJson('/api/v1/services/confirm?org=' . $this->org->fresh()->widget_token, array_filter([
                'service_id' => $this->service->id, 'service_master_id' => $masterId,
                'start_at' => now()->setTime(10, 0)->toIso8601String(), 'party_size' => 1,
                'customer_name' => 'Ada Guest', 'customer_email' => 'ada.guest@example.test',
            ], fn ($v) => $v !== null));

        return [$res, $locks];
    }

    public function test_an_any_staff_member_confirm_also_locks_every_master_it_may_pick_ascending(): void
    {
        [$res, $locks] = $this->confirm(null);

        $res->assertStatus(201);
        $booking = ServiceBooking::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole();
        $this->assertSame($this->first->id, (int) $booking->service_master_id, 'the same person as before: the first free candidate');
        if (DB::getDriverName() === 'pgsql') {
            $ids = [$this->first->id, $this->second->id];
            sort($ids);
            $this->assertSame(["svc:{$this->service->id}", "svcm:{$ids[0]}", "svcm:{$ids[1]}"], $locks, 'the service, then every candidate master, ascending');
        } else {
            $this->assertSame([], $locks, 'sqlite takes no advisory lock');
        }
    }

    public function test_a_named_master_confirm_takes_that_masters_lock_which_the_any_confirm_also_takes(): void
    {
        [$res, $locks] = $this->confirm($this->second->id);

        $res->assertStatus(201);
        $this->assertSame($this->second->id, (int) ServiceBooking::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole()->service_master_id);
        if (DB::getDriverName() === 'pgsql') {
            $this->assertSame(["svcm:{$this->second->id}", "svcm:{$this->second->id}"], $locks, 'its own key, taken again by the scheduler (re-entrant)');
        } else {
            $this->assertSame([], $locks);
        }
    }
}
