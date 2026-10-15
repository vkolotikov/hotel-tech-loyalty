<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostVariation;
use App\Services\ContentPostGenerationService;
use App\Services\ContentQualityService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PostAiTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function mockPosts(): \Mockery\MockInterface
    {
        $posts = Mockery::mock(ContentPostGenerationService::class);
        $this->app->instance(ContentPostGenerationService::class, $posts);

        return $posts;
    }

    public function test_staff_have_ai_write_a_posts_copy(): void
    {
        $post = $this->makePost();
        $this->mockPosts()->shouldReceive('generate')->once()->andReturnUsing(function (ContentPlannerPost $p, ?string $instructions) {
            $this->assertSame('Mention the October offer', $instructions);
            $p->update(['hook' => 'Fresh hook', 'main_copy' => 'Fresh copy', 'status' => 'needs_review']);

            return ['post' => $p->fresh(['visualBrief']), 'ai_response' => []];
        });

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"), ['instructions' => 'Mention the October offer'])
            ->assertOk()
            ->assertJsonPath('post.hook', 'Fresh hook')
            ->assertJsonPath('post.status', 'needs_review');
    }

    public function test_a_rewrite_answers_the_variation_and_only_the_five_kinds_exist(): void
    {
        $post = $this->makePost();
        $this->mockPosts()->shouldReceive('generateAlternatives')->once()->with(Mockery::type(ContentPlannerPost::class), 'shorter', 'Keep the emoji')
            ->andReturnUsing(fn (ContentPlannerPost $p) => ['variation' => ContentPlannerPostVariation::create(['post_id' => $p->id, 'variation_type' => 'shorter', 'copy' => 'Short copy']), 'ai_response' => 'Short copy']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/rewrite"), ['type' => 'shorter', 'guidance' => 'Keep the emoji'])
            ->assertOk()
            ->assertJsonPath('variation.type', 'shorter')
            ->assertJsonPath('variation.copy', 'Short copy');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/rewrite"), ['type' => 'sarcastic'])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_the_quality_score_comes_back_with_the_post(): void
    {
        $post = $this->makePost();
        $quality = Mockery::mock(ContentQualityService::class);
        $quality->shouldReceive('check')->once()->andReturnUsing(function (ContentPlannerPost $p) {
            // A whole number: JSON writes 8.0 as "8.0", which reads back as a float and is not the int 8.
            $result = ['scores' => ['clarity' => 8], 'overall' => 8, 'flags' => [], 'improvements' => [], 'verdict' => 'good'];
            $p->update(['quality_score' => $result]);

            return $result;
        });
        $this->app->instance(ContentQualityService::class, $quality);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/quality"))
            ->assertOk()
            ->assertJsonPath('quality.verdict', 'good')
            ->assertJsonPath('post.quality.overall', 8);
    }

    public function test_a_provider_failure_answers_ai_failed_and_leaves_the_post_as_it_was(): void
    {
        $post = $this->makePost(['hook' => 'Kept']);
        $this->mockPosts()->shouldReceive('generate')->once()->andThrow(new \RuntimeException("AI request failed for 'post_copy' generation: overloaded"));

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))
            ->assertStatus(502)
            ->assertJsonPath('error', 'ai_failed');
        $this->assertSame('Kept', $post->fresh()->hook);
    }

    public function test_at_the_budget_cap_no_ai_runs_and_writing_by_hand_still_works(): void
    {
        $post = $this->makePost();
        $this->setAiCap(100, 120);
        $this->mockPosts()->shouldNotReceive('generate');

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'By hand'])->assertCreated();
    }

    public function test_fill_writes_one_post_for_an_open_slot(): void
    {
        $this->fakeAi([$this->calendarItem('2026-10-05', 'instagram')]);

        $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => '2026-10-05', 'platform' => 'instagram'])
            ->assertCreated()
            ->assertJsonPath('post.platform', 'instagram')
            ->assertJsonPath('post.scheduled_date', '2026-10-05')
            ->assertJsonPath('post.status', 'draft');
        $this->assertSame(1, ContentPlannerPost::where('planner_profile_id', $this->profile->id)->count());
    }

    public function test_fill_refuses_a_day_that_is_not_an_open_slot(): void
    {
        $this->fakeAi([]);
        $this->makePost(['scheduled_date' => '2026-10-07']);

        foreach ([['2026-10-06', 'instagram'], ['2026-10-02', 'instagram'], ['2026-10-07', 'instagram']] as [$date, $platform]) {
            $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => $date, 'platform' => $platform])
                ->assertStatus(422)->assertJsonPath('error', 'slot_not_open');
        }
    }

    public function test_a_provider_failure_never_shows_the_providers_own_words(): void
    {
        $post = $this->makePost();
        $this->mockPosts()->shouldReceive('generate')->once()->andThrow(new \RuntimeException('Private provider detail: key sk-test'));

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/write"))
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed')
            ->assertDontSee('Private provider detail');
    }
}
