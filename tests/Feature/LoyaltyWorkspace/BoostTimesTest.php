<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\AuditLog;
use App\Models\EarnRateEvent;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * "These times are right" (release 6, spec 2026-10-23 §2 item 6): a manager confirms the boosts flagged "check the
 * time" together. Confirming stamps `times_venue_at` and changes no time; it is audited; a boost saved meanwhile, one
 * not flagged and one at a venue on UTC are left as they are; only this organisation's boosts, only a manager.
 */
class BoostTimesTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
    }

    /** A boost as one saved before release 4 left it: no `times_venue_at`. */
    private function boost(string $name, array $attributes = []): EarnRateEvent
    {
        return EarnRateEvent::create($attributes + ['name' => $name, 'multiplier' => 2, 'starts_at' => '2026-10-10 15:00:00', 'ends_at' => '2026-10-11 20:00:00', 'is_active' => true]);
    }

    private function confirm(array $ids)
    {
        return $this->asManager()->postJson($this->api('program/boosts/confirm-times?brand_id=all'), ['ids' => $ids]);
    }

    /** @return array<int, bool> boost id => check_time, as Program answers */
    private function flags(): array
    {
        return collect($this->asManager()->getJson($this->api('program?brand_id=all'))->assertOk()->json('boosts'))
            ->mapWithKeys(fn (array $b) => [$b['id'] => $b['check_time']])->sortKeys()->all();
    }

    public function test_the_route_is_a_managers(): void
    {
        $rule = AccessMap::ruleFor(Route::getRoutes()->match(Request::create('/api/v1/admin/loyalty/program/boosts/confirm-times', 'POST')));
        $this->assertSame(['admin/loyalty/program/boosts/confirm-times', 'manager', 'manager', 'loyalty'], [$rule->key, $rule->read, $rule->change, $rule->product]);
    }

    public function test_confirming_stamps_the_flagged_boosts_changes_no_time_and_is_audited(): void
    {
        $weekend = $this->boost('Weekend');
        $autumn = $this->boost('Autumn', ['starts_at' => '2026-10-01 06:00:00', 'ends_at' => '2026-11-30 21:59:00']);
        $checked = $this->boost('Checked', ['times_venue_at' => now()->subDay()]);
        $this->assertSame([$weekend->id => true, $autumn->id => true, $checked->id => false], $this->flags());
        $before = EarnRateEvent::query()->orderBy('id')->get()->map->only(['id', 'starts_at', 'ends_at'])->all();

        $this->confirm([$weekend->id, $autumn->id, $checked->id])->assertOk()
            ->assertExactJson(['confirmed' => [$weekend->id, $autumn->id], 'unchanged' => [$checked->id]]);

        $this->assertSame([$weekend->id => false, $autumn->id => false, $checked->id => false], $this->flags());
        $this->assertEquals($before, EarnRateEvent::query()->orderBy('id')->get()->map->only(['id', 'starts_at', 'ends_at'])->all());
        $this->assertSame(now()->toDateTimeString(), $weekend->fresh()->times_venue_at->toDateTimeString());
        $this->assertSame(now()->subDay()->toDateTimeString(), $checked->fresh()->times_venue_at->toDateTimeString());

        $audits = AuditLog::where('action', 'earn_rate_event_times_confirmed')->orderBy('id')->get();
        $this->assertSame([$weekend->id, $autumn->id], $audits->pluck('subject_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame(['2026-10-01T06:00:00+00:00', '2026-11-30T21:59:00+00:00', null],
            [$audits[1]->new_values['starts_at'], $audits[1]->new_values['ends_at'], $audits[1]->old_values['times_venue_at']]);
        $this->assertSame($this->manager->id, (int) $audits[0]->causer_id);

        // Pressed again: nothing left to confirm, nothing audited.
        $this->confirm([$weekend->id, $autumn->id])->assertOk()->assertExactJson(['confirmed' => [], 'unchanged' => [$weekend->id, $autumn->id]]);
        $this->assertSame(2, AuditLog::where('action', 'earn_rate_event_times_confirmed')->count());
    }

    public function test_a_boost_saved_meanwhile_is_left_as_its_save_left_it(): void
    {
        $boost = $this->boost('Weekend');
        $this->asManager()->putJson($this->api("program/boosts/{$boost->id}?brand_id=all"), [
            'name' => 'Weekend', 'multiplier' => 2, 'starts_at' => '2026-10-10T18:00', 'ends_at' => '2026-10-11T23:00',
        ])->assertOk()->assertJsonPath('boost.check_time', false);
        $saved = $boost->fresh();

        $this->confirm([$boost->id])->assertOk()->assertExactJson(['confirmed' => [], 'unchanged' => [$boost->id]]);
        $this->assertEquals($saved->only(['starts_at', 'ends_at', 'times_venue_at']), $boost->fresh()->only(['starts_at', 'ends_at', 'times_venue_at']));
        $this->assertSame(0, AuditLog::where('action', 'earn_rate_event_times_confirmed')->count());
    }

    public function test_at_a_venue_on_utc_nothing_is_flagged_so_nothing_is_confirmed(): void
    {
        $this->org->forceFill(['timezone' => 'UTC'])->save();
        app()->forgetScopedInstances();
        $boost = $this->boost('Weekend');
        $this->assertSame([$boost->id => false], $this->flags());

        $this->confirm([$boost->id])->assertOk()->assertExactJson(['confirmed' => [], 'unchanged' => [$boost->id]]);
        $this->assertNull($boost->fresh()->times_venue_at);
    }

    public function test_only_a_manager_and_only_this_organisations_boosts(): void
    {
        $boost = $this->boost('Weekend');
        $this->asStaffMember()->postJson($this->api('program/boosts/confirm-times?brand_id=all'), ['ids' => [$boost->id]])
            ->assertStatus(403)->assertJsonPath('error', 'not_allowed');

        $other = $this->otherOrganization();
        app()->instance('current_organization_id', $other['org']->id);
        $theirs = $this->boost('Theirs');
        app()->instance('current_organization_id', $this->org->id);

        $this->confirm([$boost->id, $theirs->id])->assertStatus(422)->assertJsonValidationErrors(['ids.1'])->assertJsonMissingValidationErrors(['ids.0']);
        $this->confirm([])->assertStatus(422)->assertJsonValidationErrors(['ids']);
        $this->confirm([$boost->id, $boost->id])->assertStatus(422)->assertJsonValidationErrors(['ids.0']);
        $this->confirm(['all'])->assertStatus(422)->assertJsonValidationErrors(['ids.0']);

        $this->assertNull($boost->fresh()->times_venue_at);
        $this->assertNull(EarnRateEvent::withoutGlobalScopes()->find($theirs->id)->times_venue_at);
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'earn_rate_event_times_confirmed')->count());
    }
}
