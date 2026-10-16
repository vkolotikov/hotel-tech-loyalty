<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Services\Content\BestTimes;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Best-time hints and a channel's usual time (spec 2026-10-15 §5). */
class BestTimesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_the_server_and_the_portal_read_the_same_table(): void
    {
        $this->assertSame(json_decode((string) file_get_contents(base_path('frontend/src/content/lib/bestTimes.json')), true), BestTimes::TABLE);
        $this->assertSame(['10:00', '19:00'], BestTimes::suggested('facebook', 'beauty'));
        $this->assertSame('11:00', BestTimes::usual(null, 'instagram', 'beauty'));
        $this->assertSame('08:30', BestTimes::usual('08:30', 'instagram', 'beauty'));
    }

    public function test_a_channel_keeps_a_usual_time_typed_as_hh_mm_and_clears_it_when_emptied(): void
    {
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->firstOrFail();

        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['post_time' => '08:30'])->assertOk()->assertJsonPath('channel.post_time', '08:30');
        foreach (['9:00', '25:00', '08:30:00', 'soon'] as $bad) {
            $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['post_time' => $bad])->assertStatus(422)->assertJsonValidationErrors('post_time');
        }
        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['post_time' => ''])->assertOk()->assertJsonPath('channel.post_time', null);
    }

    public function test_generated_posts_without_a_time_get_the_channels_usual_time(): void
    {
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->update(['post_time' => '08:30']);
        $untimed = fn (string $date, string $platform) => array_diff_key($this->calendarItem($date, $platform), ['time' => true]);
        $this->fakeAi([$untimed('2026-10-07', 'instagram'), $untimed('2026-10-06', 'linkedin')]);

        $this->asManager()->postJson($this->api('generate'), ['from' => '2026-10-05', 'to' => '2026-10-11'])->assertOk();

        $this->assertSame('08:30', substr((string) ContentPlannerPost::where('platform', 'instagram')->value('scheduled_time'), 0, 5));
        // LinkedIn has no usual time of its own: the first suggested one.
        $this->assertSame('08:00', substr((string) ContentPlannerPost::where('platform', 'linkedin')->value('scheduled_time'), 0, 5));
    }

    public function test_a_filled_post_without_a_time_gets_the_channels_usual_time(): void
    {
        $this->fakeAi([array_diff_key($this->calendarItem('2026-10-09', 'instagram'), ['time' => true])]);

        $this->asStaffMember()->postJson($this->api('slots/fill'), ['date' => '2026-10-09', 'platform' => 'instagram'])
            ->assertCreated()->assertJsonPath('post.scheduled_time', '11:00');
    }
}
