<?php

namespace Tests\Feature\Booking;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * The member portal sends appointment slots with the venue's offset; the
 * public booking flow must not change (the owner's ruling of 2026-09-29).
 * At a Europe/Riga venue its availability still answers the scheduler's
 * own `+00:00` strings with the same labels.
 */
class PublicServiceAvailabilityZoneTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_the_widgets_slots_at_a_riga_venue_keep_their_utc_form_and_labels(): void
    {
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        if (!Schema::hasColumn('organizations', 'timezone')) {
            Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        $org = \App\Models\Organization::create(['name' => 'Numa Riga', 'slug' => 'numa-riga-' . uniqid(), 'widget_token' => 'wt-riga-guard', 'timezone' => 'Europe/Riga']);
        ['service' => $service, 'master' => $master] = $this->seedBookableService($org->id);
        DB::table('service_master_schedules')->where('service_master_id', $master->id)->update(['start_time' => '10:00:00', 'end_time' => '18:00:00']);
        $this->travelTo(CarbonImmutable::parse('2026-10-01 08:00:00', 'UTC')); // 11:00 in Riga

        $slots = $this->getJson("/api/v1/services/availability?org=wt-riga-guard&service_id={$service->id}&date=2026-10-02")->assertOk()->json('slots');

        $this->assertSame([
            'start' => '2026-10-02T10:00:00+00:00', 'end' => '2026-10-02T10:45:00+00:00',
            'duration_minutes' => 45, 'time_label' => '10:00', 'masters' => [$master->id],
        ], $slots[0]);
        $expected = [];
        for ($m = 10 * 60; $m <= 17 * 60 + 15; $m += 15) {
            $expected[] = sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
        }
        $this->assertSame($expected, array_column($slots, 'time_label'));
        foreach ($slots as $slot) {
            $this->assertSame('2026-10-02T' . $slot['time_label'] . ':00+00:00', $slot['start']);
        }
    }
}
