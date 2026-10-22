<?php

namespace Tests\Feature\Admin;

use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The full admin's boost events (EarnRateEventController), pinned before release 4 changed how it reads a time
 * (R4-6): the three lists, the event as each endpoint answers it, the field errors, the audit rows. The venue here is
 * on UTC, where a time without an offset meant the same before and after the fix. The clock is Monday 5 October 2026,
 * 09:00 UTC.
 */
class EarnRateEventEndpointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
    }

    private function admin(string $path = ''): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/earn-rate-events' . ($path === '' ? '' : '/' . $path);
    }

    /** @return array<string, mixed> */
    private function payload(array $more = []): array
    {
        return $more + [
            'name' => 'Double weekend', 'description' => 'Fri to Sun', 'multiplier' => 2,
            'starts_at' => '2026-10-09T18:00', 'ends_at' => '2026-10-11T23:00',
            'days_of_week' => [5, 6, 0], 'tier_ids' => [$this->tiers['gold']->id], 'property_id' => null, 'is_active' => true,
        ];
    }

    private function event(string $name, string $starts, string $ends, bool $active = true): EarnRateEvent
    {
        return EarnRateEvent::create(['name' => $name, 'multiplier' => 1.5, 'starts_at' => $starts, 'ends_at' => $ends, 'is_active' => $active]);
    }

    public function test_the_list_is_three_buckets_the_latest_start_first(): void
    {
        $live = $this->event('Live', '2026-10-01 00:00:00', '2026-10-10 00:00:00');
        $soon = $this->event('Soon', '2026-10-20 00:00:00', '2026-10-21 00:00:00');
        $later = $this->event('Later', '2026-11-20 00:00:00', '2026-11-21 00:00:00');
        $over = $this->event('Over', '2026-09-01 00:00:00', '2026-09-02 00:00:00');
        $off = $this->event('Off', '2026-10-01 00:00:00', '2026-10-30 00:00:00', false);

        $response = $this->asManager()->getJson($this->admin())->assertOk();

        $this->assertSame([$live->id], array_column($response->json('active'), 'id'));
        $this->assertSame([$later->id, $soon->id], array_column($response->json('upcoming'), 'id'));
        $this->assertSame([$off->id, $over->id], array_column($response->json('past'), 'id'));
        $response->assertJsonPath('active.0.name', 'Live')
            ->assertJsonPath('active.0.multiplier', '1.50')
            ->assertJsonPath('active.0.starts_at', '2026-10-01T00:00:00.000000Z')
            ->assertJsonPath('active.0.ends_at', '2026-10-10T00:00:00.000000Z')
            ->assertJsonPath('active.0.is_active', true)
            ->assertJsonPath('active.0.organization_id', $this->org->id)
            ->assertJsonPath('active.0.brand_id', $this->brandId);
    }

    public function test_store_answers_201_with_the_event_and_audits_it(): void
    {
        $response = $this->asManager()->postJson($this->admin(), $this->payload())->assertStatus(201);

        $response->assertJsonPath('event.name', 'Double weekend')
            ->assertJsonPath('event.description', 'Fri to Sun')
            ->assertJsonPath('event.multiplier', '2.00')
            ->assertJsonPath('event.starts_at', '2026-10-09T18:00:00.000000Z')
            ->assertJsonPath('event.ends_at', '2026-10-11T23:00:00.000000Z')
            ->assertJsonPath('event.days_of_week', [5, 6, 0])
            ->assertJsonPath('event.tier_ids', [$this->tiers['gold']->id])
            ->assertJsonPath('event.is_active', true);
        $event = EarnRateEvent::query()->findOrFail($response->json('event.id'));
        $this->assertSame('2026-10-09 18:00:00', $event->getRawOriginal('starts_at'));
        $this->assertSame($this->brandId, (int) $event->brand_id);
        $audit = AuditLog::where('action', 'earn_rate_event_created')->firstOrFail();
        $this->assertSame("Earn-rate event 'Double weekend' created (2.00x)", $audit->description);
    }

    public function test_show_and_update_answer_the_event_and_empty_lists_mean_no_constraint(): void
    {
        $id = $this->asManager()->postJson($this->admin(), $this->payload())->json('event.id');

        $this->asManager()->getJson($this->admin((string) $id))->assertOk()
            ->assertJsonPath('event.id', $id)->assertJsonPath('event.starts_at', '2026-10-09T18:00:00.000000Z');

        $this->asManager()->putJson($this->admin((string) $id), $this->payload(['name' => 'Long weekend', 'ends_at' => '2026-10-12T08:30', 'days_of_week' => [], 'tier_ids' => []]))
            ->assertOk()
            ->assertJsonPath('event.name', 'Long weekend')
            ->assertJsonPath('event.ends_at', '2026-10-12T08:30:00.000000Z')
            ->assertJsonPath('event.days_of_week', null)
            ->assertJsonPath('event.tier_ids', null);
        $this->assertSame(1, AuditLog::where('action', 'earn_rate_event_updated')->count());
    }

    public function test_the_fields_are_checked_and_the_end_comes_after_the_start(): void
    {
        $this->asManager()->postJson($this->admin(), $this->payload(['name' => '', 'multiplier' => 11]))
            ->assertStatus(422)->assertJsonValidationErrors(['name', 'multiplier']);
        $this->asManager()->postJson($this->admin(), $this->payload(['ends_at' => '2026-10-09T17:00']))
            ->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $this->assertSame(0, EarnRateEvent::query()->count());
    }

    public function test_destroy_answers_success_and_audits_it(): void
    {
        $event = $this->event('Gone', '2026-10-01 00:00:00', '2026-10-10 00:00:00');

        $this->asManager()->deleteJson($this->admin((string) $event->id))->assertOk()->assertExactJson(['success' => true]);
        $this->assertNull(EarnRateEvent::query()->find($event->id));
        $this->assertSame(1, AuditLog::where('action', 'earn_rate_event_deleted')->count());
    }

    // ── Release 4 (R4-6): the venue's wall clock ─────────────────────────

    private function venueIn(string $zone): void
    {
        $this->org->forceFill(['timezone' => $zone])->save();
        app()->forgetScopedInstances();
    }

    public function test_a_time_without_an_offset_is_the_venues_wall_clock_and_every_answer_shows_it_on_that_clock(): void
    {
        // Riga is three hours ahead of UTC in October: 18:00 there is 15:00 UTC.
        $this->venueIn('Europe/Riga');

        $created = $this->asManager()->postJson($this->admin(), $this->payload())->assertStatus(201)
            ->assertJsonPath('event.starts_at', '2026-10-09T15:00:00.000000Z')
            ->assertJsonPath('event.ends_at', '2026-10-11T20:00:00.000000Z')
            ->assertJsonPath('event.starts_at_venue', '2026-10-09T18:00')
            ->assertJsonPath('event.ends_at_venue', '2026-10-11T23:00');
        $id = $created->json('event.id');
        $event = EarnRateEvent::query()->findOrFail($id);
        $this->assertSame('2026-10-09 15:00:00', $event->getRawOriginal('starts_at'));
        $this->assertNotNull($event->times_venue_at);

        $this->asManager()->getJson($this->admin())->assertOk()
            ->assertJsonPath('timezone', 'Europe/Riga')
            ->assertJsonPath('upcoming.0.starts_at_venue', '2026-10-09T18:00')
            ->assertJsonPath('upcoming.0.ends_at_venue', '2026-10-11T23:00');
        $this->asManager()->getJson($this->admin((string) $id))->assertJsonPath('event.starts_at_venue', '2026-10-09T18:00');

        // An offset is the instant written, whatever the venue's zone.
        $this->asManager()->putJson($this->admin((string) $id), $this->payload(['starts_at' => '2026-10-09T18:00:00+00:00']))->assertOk()
            ->assertJsonPath('event.starts_at', '2026-10-09T18:00:00.000000Z')
            ->assertJsonPath('event.starts_at_venue', '2026-10-09T21:00');
    }

    public function test_every_save_marks_the_times_as_the_venues_and_the_workspace_then_stops_asking(): void
    {
        $this->venueIn('Europe/Riga');
        // Saved before release 4: no mark.
        $old = $this->event('Old boost', '2026-10-09 18:00:00', '2026-10-11 23:00:00');
        $this->assertNull($old->fresh()->times_venue_at);
        $program = fn () => collect($this->asManager()->getJson($this->workspace('program'))->json('boosts'))->keyBy('id');
        $this->assertTrue($program()[$old->id]['check_time']);

        $this->asManager()->putJson($this->admin((string) $old->id), $this->payload())->assertOk();

        $this->assertNotNull($old->fresh()->times_venue_at);
        $this->assertFalse($program()[$old->id]['check_time']);
    }

    private function workspace(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/loyalty/' . $path . '?brand_id=all';
    }

    public function test_another_organisations_event_is_not_found(): void
    {
        $other = $this->otherOrganization();
        $prior = app('current_organization_id');
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = $this->event('Theirs', '2026-10-01 00:00:00', '2026-10-10 00:00:00');
        app()->instance('current_organization_id', $prior);

        $this->asManager()->getJson($this->admin((string) $theirs->id))->assertNotFound();
        $this->asManager()->putJson($this->admin((string) $theirs->id), $this->payload())->assertNotFound();
        $this->assertSame([], $this->asManager()->getJson($this->admin())->json('active'));
    }
}
