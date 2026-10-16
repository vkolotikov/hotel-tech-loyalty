<?php

namespace Tests\Feature\Content;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_week_has_its_posts_open_slots_figures_and_the_tray(): void
    {
        $this->makePost(['topic' => 'Wed draft', 'scheduled_date' => '2026-10-07', 'scheduled_time' => '09:00']);
        $this->makePost(['topic' => 'Tue ready', 'platform' => 'linkedin', 'status' => 'ready_to_publish', 'scheduled_date' => '2026-10-06']);
        $this->makePost(['topic' => 'Fri published', 'status' => 'published', 'scheduled_date' => '2026-10-09']);
        $this->makePost(['topic' => 'Mon archived', 'status' => 'archived', 'scheduled_date' => '2026-10-05']);
        $this->makePost(['topic' => 'Sat skipped', 'status' => 'skipped', 'scheduled_date' => '2026-10-10']);
        $this->makePost(['topic' => 'An idea', 'status' => 'idea', 'scheduled_date' => null]);

        $answer = $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk();

        $this->assertSame(['Tue ready', 'Wed draft', 'Fri published', 'Sat skipped'], array_column($answer->json('posts'), 'topic'));
        $this->assertSame([['date' => '2026-10-05', 'platform' => 'instagram'], ['date' => '2026-10-08', 'platform' => 'linkedin']], $answer->json('slots'));
        $this->assertSame(['planned' => 3, 'ready' => 1, 'published' => 1, 'open_slots' => 2], $answer->json('figures'));
        $this->assertSame(['An idea'], array_column($answer->json('unscheduled'), 'topic'));
    }

    public function test_slots_start_from_the_venues_today_not_the_servers(): void
    {
        // 22:30 UTC on Monday is already 01:30 on Tuesday in Riga: Monday's Instagram slot is gone.
        $this->org->forceFill(['timezone' => 'Europe/Riga'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 22:30:00'));

        $slots = $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))->assertOk()->json('slots');

        $this->assertNotContains(['date' => '2026-10-05', 'platform' => 'instagram'], $slots);
        $this->assertContains(['date' => '2026-10-06', 'platform' => 'linkedin'], $slots);
    }

    public function test_a_range_is_checked_and_a_brand_without_a_profile_has_an_empty_plan(): void
    {
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-01&to=2026-12-15'))->assertStatus(422)->assertJsonValidationErrors('to');
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-10&to=2026-10-01'))->assertStatus(422);
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-01&to=2026-11-11'))->assertOk(); // a six-week month grid fits

        [$second] = $this->secondBrand(withProfile: false);
        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11') . '&brand_id=' . $second)
            ->assertOk()
            ->assertJsonPath('figures', ['planned' => 0, 'ready' => 0, 'published' => 0, 'open_slots' => 0]);
    }

    public function test_the_tray_lists_a_hundred_and_says_how_many_there_are(): void
    {
        for ($i = 0; $i < 102; $i++) {
            $this->makePost(['scheduled_date' => null, 'topic' => "Idea {$i}"]);
        }
        $this->makePost(['scheduled_date' => null, 'status' => 'archived']);

        $this->asStaffMember()->getJson($this->api('plan?from=2026-10-05&to=2026-10-11'))
            ->assertOk()->assertJsonCount(100, 'unscheduled')->assertJsonPath('unscheduled_total', 102);
        [$second] = $this->secondBrand(false);
        $this->asManager()->getJson($this->api("plan?from=2026-10-05&to=2026-10-11&brand_id={$second}"))
            ->assertOk()->assertJsonPath('unscheduled_total', 0);
    }
}
