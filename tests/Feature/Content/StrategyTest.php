<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerStrategy;
use App\Services\ContentPlannerStrategyService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class StrategyTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function strategy(string $status, string $title = 'Autumn plan'): ContentPlannerStrategy
    {
        return ContentPlannerStrategy::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'title' => $title, 'status' => $status]);
    }

    public function test_a_manager_starts_a_strategy_and_the_job_writes_it(): void
    {
        $service = Mockery::mock(ContentPlannerStrategyService::class);
        $service->shouldReceive('generate')->once()->andReturnUsing(function (ContentPlannerProfile $profile, array $params, ContentPlannerStrategy $into) {
            $this->assertSame('Focus on autumn', $params['instructions']);
            $into->update(['status' => 'active', 'title' => 'Written strategy']);

            return ['strategy' => $into, 'pillars' => []];
        });
        $this->app->instance(ContentPlannerStrategyService::class, $service);

        $id = $this->asManager()->postJson($this->api('strategies'), ['instructions' => 'Focus on autumn'])
            ->assertStatus(202)
            ->json('strategy.id');

        // The queue is synchronous in tests: the job has already run.
        $this->assertSame('active', ContentPlannerStrategy::find($id)->status);
        $this->asStaffMember()->getJson($this->api('strategies'))->assertOk()->assertJsonPath('strategies.0.title', 'Written strategy');
    }

    public function test_staff_read_strategies_but_may_not_start_switch_or_archive_one(): void
    {
        $strategy = $this->strategy('active');

        $this->asStaffMember()->getJson($this->api("strategies/{$strategy->id}"))->assertOk();
        $this->asStaffMember()->postJson($this->api('strategies'))->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api("strategies/{$strategy->id}/archive"))->assertStatus(403);
        $this->asStaffMember()->postJson($this->api("strategies/{$strategy->id}/activate"))->assertStatus(403);
    }

    public function test_one_strategy_at_a_time_but_a_stuck_one_does_not_block_for_ever(): void
    {
        $this->strategy('generating');
        $this->asManager()->postJson($this->api('strategies'))->assertStatus(409)->assertJsonPath('error', 'already_generating');

        $this->travel(16)->minutes();
        $service = Mockery::mock(ContentPlannerStrategyService::class);
        $service->shouldReceive('generate')->once()->andReturn(['strategy' => null, 'pillars' => []]);
        $this->app->instance(ContentPlannerStrategyService::class, $service);
        $this->asManager()->postJson($this->api('strategies'))->assertStatus(202);
    }

    public function test_activating_one_supersedes_the_active_one_and_archiving_works(): void
    {
        $old = $this->strategy('active', 'Old');
        $chosen = $this->strategy('superseded', 'Chosen');

        $this->asManager()->postJson($this->api("strategies/{$chosen->id}/activate"))->assertOk()->assertJsonPath('strategy.status', 'active');
        $this->assertSame('superseded', $old->fresh()->status);

        $this->asManager()->postJson($this->api("strategies/{$old->id}/archive"))->assertOk()->assertJsonPath('strategy.status', 'archived');
        $this->asManager()->postJson($this->api('strategies/' . $this->strategy('generating', 'Busy')->id . '/activate'))->assertStatus(422)->assertJsonPath('error', 'not_ready');
    }

    public function test_the_active_strategy_shows_this_months_posts_per_pillar_against_the_targets(): void
    {
        $strategy = $this->strategy('active');
        $education = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'strategy_id' => $strategy->id, 'brand_id' => $this->brandId, 'name' => 'Education', 'frequency_weight' => 6, 'active' => true]);
        $proof = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'strategy_id' => $strategy->id, 'brand_id' => $this->brandId, 'name' => 'Proof', 'frequency_weight' => 4, 'active' => true]);
        $this->makePost(['pillar_id' => $education->id, 'scheduled_date' => '2026-10-07']);
        $this->makePost(['pillar_id' => $education->id, 'scheduled_date' => '2026-10-21']);
        $this->makePost(['pillar_id' => $education->id, 'scheduled_date' => '2026-11-02']); // next month
        $this->makePost(['pillar_id' => $proof->id, 'scheduled_date' => '2026-10-09', 'status' => 'skipped']);

        $this->asStaffMember()->getJson($this->api("strategies/{$strategy->id}"))
            ->assertOk()
            ->assertJsonPath('strategy.balance.from', '2026-10-01')
            ->assertJsonPath('strategy.balance.to', '2026-10-31')
            ->assertJsonPath('strategy.balance.pillars', [
                ['id' => $education->id, 'name' => 'Education', 'target_weight' => 6, 'posts' => 2],
                ['id' => $proof->id, 'name' => 'Proof', 'target_weight' => 4, 'posts' => 0],
            ]);
    }

    public function test_another_brands_strategy_does_not_exist_here(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerStrategy::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'title' => 'Theirs', 'status' => 'active']);

        $this->asManager()->getJson($this->api("strategies/{$theirs->id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
    }

    public function test_making_a_strategy_active_switches_the_pillars_the_ai_plans_with(): void
    {
        $old = $this->strategy('superseded', 'Old');
        $current = $this->strategy('active', 'Current');
        $oldPillar = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'strategy_id' => $old->id, 'brand_id' => $this->brandId, 'name' => 'Old pillar', 'active' => false]);
        $currentPillar = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'strategy_id' => $current->id, 'brand_id' => $this->brandId, 'name' => 'Current pillar', 'active' => true]);

        $this->asManager()->postJson($this->api("strategies/{$old->id}/activate"))->assertOk();
        $this->assertTrue((bool) $oldPillar->fresh()->active);
        $this->assertFalse((bool) $currentPillar->fresh()->active);

        // Archiving the active strategy stops the AI planning by its pillars; archiving another one changes none.
        $this->asManager()->postJson($this->api("strategies/{$current->id}/archive"))->assertOk();
        $this->assertTrue((bool) $oldPillar->fresh()->active);
        $this->asManager()->postJson($this->api("strategies/{$old->id}/archive"))->assertOk();
        $this->assertFalse((bool) $oldPillar->fresh()->active);
    }

    public function test_two_requests_at_once_cannot_both_start_a_strategy(): void
    {
        $held = Cache::lock("content:strategy:{$this->org->id}:{$this->brandId}", 10);
        $this->assertTrue($held->get());

        $this->asManager()->postJson($this->api('strategies'), [])->assertStatus(409)->assertJsonPath('error', 'already_generating');
        $this->assertSame(0, \App\Models\ContentPlannerStrategy::where('status', 'generating')->count());
        $held->release();
    }
}
