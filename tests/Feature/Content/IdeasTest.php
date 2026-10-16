<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerPillar;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The Ideas board (spec 2026-10-16 §4): the posts without a day, in four columns by status. */
class IdeasTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @return array<string, array{posts: list<array<string, mixed>>, total: int}> */
    private function ideas(string $query = ''): array
    {
        return $this->asStaffMember()->getJson($this->api('ideas' . $query))->assertOk()->json('columns');
    }

    public function test_the_board_holds_the_posts_without_a_day_in_four_columns(): void
    {
        foreach (['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'] as $status) {
            $this->makePost(['status' => $status, 'scheduled_date' => null, 'topic' => "No day {$status}"]);
        }
        $this->makePost(['status' => 'idea', 'topic' => 'Has a day']);

        $columns = $this->ideas();
        $this->assertSame(['idea', 'draft', 'review', 'ready'], array_keys($columns));
        $this->assertSame([1, 1, 2, 2], array_map(fn (array $c) => $c['total'], array_values($columns)));
        $this->assertSame('No day idea', $columns['idea']['posts'][0]['topic']);
        $this->assertEqualsCanonicalizing(['needs_review', 'needs_visual'], array_column($columns['review']['posts'], 'status'));
        $this->assertEqualsCanonicalizing(['approved', 'ready_to_publish'], array_column($columns['ready']['posts'], 'status'));
    }

    public function test_each_column_shows_its_fifty_latest_and_its_total(): void
    {
        for ($i = 0; $i < 55; $i++) {
            $post = $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'topic' => "Idea {$i}"]);
            DB::table('content_planner_posts')->where('id', $post->id)->update(['updated_at' => CarbonImmutable::parse('2026-10-01 08:00:00')->addMinutes($i)]);
        }

        $idea = $this->ideas()['idea'];
        $this->assertSame(55, $idea['total']);
        $this->assertCount(50, $idea['posts']);
        $this->assertSame('Idea 54', $idea['posts'][0]['topic']);
        $this->assertSame('Idea 5', $idea['posts'][49]['topic']);
    }

    public function test_the_board_filters_by_platform_and_pillar(): void
    {
        $pillar = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Education', 'active' => true]);
        $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'platform' => 'linkedin', 'topic' => 'On LinkedIn']);
        $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'pillar_id' => $pillar->id, 'topic' => 'Teaching']);
        $this->makePost(['status' => 'idea', 'scheduled_date' => null, 'topic' => 'Plain']);

        $this->assertSame(['On LinkedIn'], array_column($this->ideas('?platform=linkedin')['idea']['posts'], 'topic'));
        $this->assertSame(['Teaching'], array_column($this->ideas("?pillar_id={$pillar->id}")['idea']['posts'], 'topic'));
        $this->asStaffMember()->getJson($this->api('ideas?platform=myspace'))->assertStatus(422)->assertJsonValidationErrors('platform');
    }

    public function test_another_brands_ideas_are_not_here_and_a_brand_without_a_profile_has_an_empty_board(): void
    {
        [$second] = $this->secondBrand();
        $this->asManager()->postJson($this->api("posts?brand_id={$second}"), ['platform' => 'instagram', 'status' => 'idea', 'topic' => 'Theirs'])->assertCreated();
        $this->assertSame(0, $this->ideas()['idea']['total']);

        [$third] = $this->secondBrand(false);
        $this->assertSame(['idea' => 0, 'draft' => 0, 'review' => 0, 'ready' => 0], array_map(fn (array $c) => $c['total'], $this->ideas("?brand_id={$third}")));
    }

    public function test_quick_capture_makes_an_idea_without_a_day(): void
    {
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'status' => 'idea', 'topic' => 'Behind the scenes of a facial', 'scheduled_time' => '10:00'])
            ->assertCreated()
            ->assertJsonPath('post.status', 'idea')
            ->assertJsonPath('post.scheduled_date', null)
            ->assertJsonPath('post.scheduled_time', null);

        $this->assertSame('Behind the scenes of a facial', $this->ideas()['idea']['posts'][0]['topic']);
    }
}
