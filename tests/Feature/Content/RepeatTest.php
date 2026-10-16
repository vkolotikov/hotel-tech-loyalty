<?php

namespace Tests\Feature\Content;

use App\Jobs\RewriteRepeatCopies;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentRepeat;
use App\Services\Content\ContentRepeatRewriter;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Repeat posts (spec 2026-10-15 §8). Today is Monday 5 October 2026. */
class RepeatTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @return list<ContentPlannerPost> the copies of a series, by day */
    private function copiesOf(ContentPlannerPost $post): array
    {
        return ContentPlannerPost::where('series_id', $post->id)->where('id', '!=', $post->id)->orderBy('scheduled_date')->get()->all();
    }

    private function days(array $posts): array
    {
        return array_map(fn (ContentPlannerPost $p) => $p->scheduled_date->format('Y-m-d'), $posts);
    }

    public function test_a_weekly_repeat_makes_copies_on_the_same_weekday_with_the_posts_words(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'scheduled_time' => '09:30', 'hook' => 'Autumn tips', 'main_copy' => 'Warm tones.', 'hashtags' => ['#autumn'], 'status' => 'ready_to_publish']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])
            ->assertCreated()->assertJsonCount(3, 'copies')->assertJsonPath('post.series_id', $post->id);

        $copies = $this->copiesOf($post);
        $this->assertSame(['2026-10-14', '2026-10-21', '2026-10-28'], $this->days($copies));
        $this->assertSame('Autumn tips', $copies[2]->hook);
        $this->assertSame('Warm tones.', $copies[0]->main_copy);
        $this->assertSame(['#autumn'], $copies[0]->hashtags);
        $this->assertSame('ready_to_publish', $copies[0]->status);
        $this->assertSame('09:30', substr((string) $copies[0]->scheduled_time, 0, 5));
        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))
            ->assertJsonPath('post.series', ['id' => $post->id, 'every' => 'week', 'until' => '2026-10-28', 'more' => 3, 'removable' => 3, 'rewriting' => false]);
    }

    public function test_a_published_post_repeats_as_drafts_and_only_from_today_on(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-09-30', 'status' => 'published', 'published_at' => '2026-09-30 09:00:00']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated()->assertJsonCount(3, 'copies');

        $copies = $this->copiesOf($post);
        $this->assertSame(['2026-10-07', '2026-10-14', '2026-10-21'], $this->days($copies));
        $this->assertSame(['draft'], array_values(array_unique(array_map(fn ($c) => $c->status, $copies))));
    }

    public function test_a_monthly_repeat_keeps_the_day_or_takes_the_months_last(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-01-20 09:00:00'));
        $post = $this->makePost(['scheduled_date' => '2026-01-31']);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'month', 'until' => '2026-05-31'])->assertCreated();

        $this->assertSame(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'], $this->days($this->copiesOf($post)));
    }

    public function test_refusals_a_series_a_post_without_a_day_and_the_caps(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated();
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])
            ->assertStatus(409)->assertJsonPath('error', 'already_repeating');

        $noDay = $this->makePost(['scheduled_date' => null]);
        $this->asStaffMember()->postJson($this->api("posts/{$noDay->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])
            ->assertStatus(422)->assertJsonPath('error', 'no_day');

        $other = $this->makePost(['scheduled_date' => '2026-10-08']);
        $refused = fn (array $body, string $field) => $this->asStaffMember()->postJson($this->api("posts/{$other->id}/repeat"), $body)->assertStatus(422)->assertJsonValidationErrors($field);
        $refused(['every' => 'week', 'until' => '2027-10-09'], 'until');                      // more than 12 months
        $refused(['every' => 'week', 'until' => '2027-04-15'], 'until');                      // 27 copies
        $refused(['every' => 'week', 'until' => '2027-01-14', 'ai_rewrite' => true], 'ai_rewrite'); // 14 copies for the AI
        $refused(['every' => 'daily', 'until' => '2026-10-15'], 'every');
        $refused(['every' => 'week', 'until' => '2026-10-10'], 'until');                      // no day before then
        $this->assertNull($other->fresh()->series_id);
    }

    public function test_stop_repeating_removes_future_unpublished_copies_and_keeps_the_rest(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated();
        $published = $this->copiesOf($post)[0];
        $published->update(['status' => 'published', 'published_at' => now()]);

        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}/repeat"))->assertOk()
            ->assertJsonPath('removed', 2)->assertJsonPath('post.series', null);

        $this->assertNotNull($post->fresh());
        $this->assertNull($published->fresh()->series_id);
        $this->assertSame(0, ContentPlannerPost::whereDate('scheduled_date', '>=', '2026-10-21')->count());
    }

    public function test_another_organisations_post_does_not_repeat_here_and_a_copy_of_a_series_post_is_not_in_it(): void
    {
        $other = $this->otherOrganization();
        $this->asStaffMember()->postJson($this->api("posts/{$other['post']->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertNotFound();
        $this->asStaffMember()->deleteJson($this->api("posts/{$other['post']->id}/repeat"))->assertNotFound();

        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14'])->assertCreated();
        $copy = $this->asStaffMember()->postJson($this->api("posts/{$post->id}/duplicate"))->assertSuccessful()->json('post.id');
        $this->assertNull(ContentPlannerPost::find($copy)->series_id);
    }

    public function test_the_ai_rewords_each_copy_and_leaves_the_original(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips', 'main_copy' => 'Warm tones.']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $n = 0;
        $rewriter->shouldReceive('rewrite')->times(3)->andReturnUsing(function () use (&$n) {
            $n++;

            return ['hook' => "Fresh hook {$n}", 'main_copy' => "Fresh text {$n}"];
        });
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28', 'ai_rewrite' => true])->assertCreated();

        $this->assertSame(['Fresh hook 1', 'Fresh hook 2', 'Fresh hook 3'], array_map(fn ($c) => $c->hook, $this->copiesOf($post)));
        $this->assertSame('Autumn tips', $post->fresh()->hook);
        $this->assertFalse(Cache::has(ContentRepeat::rewritingKey($post->id)), 'the job ends the rewording');
    }

    public function test_rewording_is_refused_at_the_budget_cap_before_anything_is_made(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->setAiCap(100, 120);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldNotReceive('rewrite');
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28', 'ai_rewrite' => true])
            ->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
        $this->assertSame([], $this->copiesOf($post));
    }

    public function test_rewording_stops_when_the_budget_runs_out_midway_and_keeps_what_is_done(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->once()->andReturnUsing(function () {
            $this->setAiCap(100, 120); // this call used the rest of the month's budget

            return ['hook' => 'Fresh hook', 'main_copy' => 'Fresh text'];
        });
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28', 'ai_rewrite' => true])->assertCreated();

        $this->assertSame(['Fresh hook', 'Autumn tips', 'Autumn tips'], array_map(fn ($c) => $c->hook, $this->copiesOf($post)));
    }

    public function test_a_copy_a_person_changed_keeps_the_persons_words(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21'])->assertCreated();
        [$first, $second] = $this->copiesOf($post);
        $this->travel(5)->minutes();
        $second->update(['hook' => 'My own words']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->once()->andReturn(['hook' => 'Fresh hook', 'main_copy' => 'Fresh text']);
        $this->app->instance(ContentRepeatRewriter::class, $rewriter); // the job hands the rest on to its next run

        (new RewriteRepeatCopies((int) $post->id, (int) $this->org->id, $this->brandId, [(int) $first->id, (int) $second->id]))->handle($rewriter, app(ContentAiGate::class));

        $this->assertSame('Fresh hook', $first->fresh()->hook);
        $this->assertSame('My own words', $second->fresh()->hook);
    }

    // Final review: "more" counted days already gone, and Stop's own count was not given.
    public function test_a_week_later_the_series_counts_what_is_still_ahead_and_what_stop_removes(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated();
        [$first] = $this->copiesOf($post);
        $this->travelTo(CarbonImmutable::parse('2026-10-22 09:00:00'));

        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.series.more', 1)->assertJsonPath('post.series.removable', 1);
        $this->asStaffMember()->getJson($this->api("posts/{$first->id}"))->assertJsonPath('post.series.more', 1)->assertJsonPath('post.series.removable', 1);
        $this->asStaffMember()->deleteJson($this->api("posts/{$post->id}/repeat"))->assertJsonPath('removed', 1);
    }

    // Final review: a person's save that landed while the AI wrote was overwritten.
    public function test_a_save_made_while_the_ai_writes_keeps_the_persons_words(): void
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07', 'hook' => 'Autumn tips']);
        $rewriter = Mockery::mock(ContentRepeatRewriter::class);
        $rewriter->shouldReceive('rewrite')->once()->andReturnUsing(function (ContentPlannerPost $copy) {
            $this->travel(1)->minutes();
            ContentPlannerPost::findOrFail($copy->id)->update(['hook' => 'My own words']);

            return ['hook' => 'Fresh hook', 'main_copy' => 'Fresh text'];
        });
        $this->app->instance(ContentRepeatRewriter::class, $rewriter);

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-14', 'ai_rewrite' => true])->assertCreated();

        $this->assertSame('My own words', $this->copiesOf($post)[0]->hook);
    }

    // Final review: a 900-second job outlived the queue's retry_after (90 s), so a second worker took it and failed it.
    public function test_each_rewording_run_ends_before_the_queue_would_hand_it_to_another_worker(): void
    {
        $job = new RewriteRepeatCopies(1, 1, 1, []);
        foreach (['database', 'redis', 'beanstalkd'] as $connection) {
            $this->assertLessThan((int) config("queue.connections.{$connection}.retry_after"), $job->timeout, $connection);
        }
    }
}
