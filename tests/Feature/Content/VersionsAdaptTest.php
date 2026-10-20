<?php

namespace Tests\Feature\Content;

use App\Jobs\AdaptPostVersions;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentVersionAdapter;
use App\Services\Content\ContentVersions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Versions adapted by AI (spec 2026-10-19 §3.3): in the background, one at a time, within the budget, never over a person's words. */
class VersionsAdaptTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function adapter(): \Mockery\MockInterface
    {
        $adapter = Mockery::mock(ContentVersionAdapter::class);
        $this->app->instance(ContentVersionAdapter::class, $adapter);

        return $adapter;
    }

    private function version(ContentPlannerPost $post, string $platform): ContentPlannerPost
    {
        return ContentPlannerPost::where('group_id', $post->id)->where('platform', $platform)->firstOrFail();
    }

    public function test_the_ai_adapts_each_version_from_the_originals_platform_and_leaves_the_original(): void
    {
        $this->adapter()->shouldReceive('adapt')->twice()->andReturnUsing(fn (ContentPlannerPost $version, string $from) => [
            'hook' => "For {$version->platform} from {$from}", 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => 'Book', 'hashtags' => ['#a', '#b'],
        ]);
        $post = $this->makePost(['hook' => 'Autumn tips', 'main_copy' => 'Warm tones.']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x'], 'ai' => true])
            ->assertCreated()
            ->assertJsonPath('versions.0.hook', 'For linkedin from instagram')
            ->assertJsonPath('versions.1.hook', 'For x from instagram')
            ->assertJsonPath('post.group.adapting', [])
            ->assertJsonPath('post.group.kept_original', []);

        $this->assertSame(['#a', '#b'], $this->version($post, 'x')->hashtags);
        $this->assertSame('Adapted text', $this->version($post, 'linkedin')->main_copy);
        $this->assertSame('Autumn tips', $post->fresh()->hook);
        $this->assertFalse(Cache::has(ContentVersions::adaptingKey($post->id)), 'the job ends the adapting');
    }

    public function test_adapting_is_refused_at_the_budget_cap_before_anything_is_made(): void
    {
        $this->setAiCap(100, 120);
        $this->adapter()->shouldNotReceive('adapt');
        $post = $this->makePost();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->assertNull($post->fresh()->group_id);
        $this->assertSame(1, ContentPlannerPost::count());

        // Copy as is needs no budget.
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
    }

    public function test_when_the_budget_runs_out_midway_the_rest_keep_the_original_text_and_the_panel_says_so(): void
    {
        $this->adapter()->shouldReceive('adapt')->once()->andReturnUsing(function () {
            $this->setAiCap(100, 120); // this call used the rest of the month's budget

            return ['hook' => 'Adapted', 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => null, 'hashtags' => []];
        });
        $post = $this->makePost(['hook' => 'Autumn tips']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'facebook', 'x'], 'ai' => true])->assertCreated();

        [$linkedin, $facebook, $x] = [$this->version($post, 'linkedin'), $this->version($post, 'facebook'), $this->version($post, 'x')];
        $this->assertSame(['Adapted', 'Autumn tips', 'Autumn tips'], [$linkedin->hook, $facebook->hook, $x->hook]);
        $this->asStaffMember()->getJson($this->api("posts/{$x->id}"))->assertOk()
            ->assertJsonPath('post.group.kept_original', [$facebook->id, $x->id])
            ->assertJsonPath('post.group.kept_reason', 'budget');

        // A kept version a person then edits is theirs: nothing more is said about it.
        $this->travel(1)->minutes();
        $this->asStaffMember()->putJson($this->api("posts/{$facebook->id}"), ['updated_at' => $facebook->updated_at->toISOString(), 'hook' => 'My words'])
            ->assertOk()->assertJsonPath('post.group.kept_original', [$x->id]);
    }

    public function test_a_version_saved_while_the_ai_writes_keeps_the_persons_words(): void
    {
        $this->adapter()->shouldReceive('adapt')->once()->andReturnUsing(function (ContentPlannerPost $version) {
            $this->travel(1)->minutes();
            ContentPlannerPost::findOrFail($version->id)->update(['hook' => 'My own words']);

            return ['hook' => 'Adapted', 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => null, 'hashtags' => []];
        });
        $post = $this->makePost();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])->assertCreated();

        $this->assertSame('My own words', $this->version($post, 'linkedin')->hook);
    }

    public function test_a_version_a_person_changed_before_its_turn_keeps_the_persons_words(): void
    {
        $post = $this->makePost(['hook' => 'Autumn tips']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x']])->assertCreated();
        [$linkedin, $x] = [$this->version($post, 'linkedin'), $this->version($post, 'x')];
        $this->travel(5)->minutes();
        $x->update(['hook' => 'My own words']);
        $adapter = $this->adapter(); // the job hands the rest on to its next run, which takes the adapter from the container
        $adapter->shouldReceive('adapt')->once()->andReturn(['hook' => 'Adapted', 'main_copy' => 'Adapted text', 'short_copy' => null, 'cta' => null, 'hashtags' => []]);

        (new AdaptPostVersions($post->id, (int) $this->org->id, $this->brandId, 'instagram', [(int) $linkedin->id, (int) $x->id]))->handle($adapter, app(ContentAiGate::class));

        $this->assertSame('Adapted', $linkedin->fresh()->hook);
        $this->assertSame('My own words', $x->fresh()->hook);
    }

    public function test_when_the_ai_fails_the_versions_keep_the_original_text_and_the_panel_says_why(): void
    {
        $this->adapter()->shouldReceive('adapt')->once()->andThrow(new \RuntimeException('Overloaded'));
        $post = $this->makePost(['hook' => 'Autumn tips']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x'], 'ai' => true])
            ->assertCreated()
            ->assertJsonPath('post.group.kept_reason', 'ai_failed')
            ->assertJsonCount(2, 'post.group.kept_original');
        $this->assertSame('Autumn tips', $this->version($post, 'x')->hook);
    }

    // As RepeatTest: a run longer than the queue's retry_after (90 s) is taken again by a second worker.
    public function test_the_panel_lists_the_versions_still_being_adapted_and_each_run_ends_before_the_queue_retries_it(): void
    {
        $post = $this->makePost();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin']])->assertCreated();
        $linkedin = $this->version($post, 'linkedin');
        ContentVersions::stillAdapting($post->id, [(int) $linkedin->id]);

        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.group.adapting', [$linkedin->id]);

        $job = new AdaptPostVersions(1, 1, 1, 'instagram', []);
        foreach (['database', 'redis', 'beanstalkd'] as $connection) {
            $this->assertLessThan((int) config("queue.connections.{$connection}.retry_after"), $job->timeout, $connection);
        }
    }

    // 5A-1 review: a later batch that stopped for another reason must not relabel the versions kept earlier.
    public function test_each_kept_version_keeps_its_own_reason(): void
    {
        $original = $this->makePost(['platform' => 'instagram']);
        $versions = ContentVersions::make($original, ['linkedin', 'facebook'], $this->staffMember->id);
        [$first, $second] = [(int) $versions[0]->id, (int) $versions[1]->id];

        ContentVersions::keep((int) $original->id, [$first], 'budget');
        ContentVersions::keep((int) $original->id, [$second], 'ai_failed');

        $this->assertSame('budget', ContentVersions::describe(ContentPlannerPost::findOrFail($first))['kept_reason']);
        $this->assertSame('ai_failed', ContentVersions::describe(ContentPlannerPost::findOrFail($second))['kept_reason']);
        $this->assertSame([$first, $second], ContentVersions::describe(ContentPlannerPost::findOrFail($first))['kept_original']);
    }
}
