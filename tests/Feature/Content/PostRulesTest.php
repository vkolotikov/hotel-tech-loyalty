<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPillar;
use App\Models\ContentPlannerPost;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class PostRulesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_a_save_from_a_stale_copy_is_refused_with_the_current_post(): void
    {
        $post = $this->makePost(['hook' => 'Mine']);
        $seen = $post->fresh()->updated_at->toISOString();
        $this->travel(1)->minutes();
        $post->update(['hook' => 'Theirs']); // someone else saved since

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Mine again'])
            ->assertStatus(409)
            ->assertJsonPath('error', 'changed_elsewhere')
            ->assertJsonPath('post.hook', 'Theirs');
        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('Theirs', $post->fresh()->hook);
    }

    public function test_a_published_post_keeps_its_date(): void
    {
        $post = $this->makePost(['status' => 'published']);
        $seen = $post->fresh()->updated_at->toISOString();

        $this->asStaffMember()->postJson($this->api("posts/{$post->id}/move"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertStatus(422)->assertJsonPath('error', 'published_cannot_move');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'scheduled_date' => '2026-10-09'])
            ->assertStatus(422)->assertJsonPath('error', 'published_cannot_move');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'hook' => 'Edited after'])->assertOk();
    }

    public function test_ids_from_another_organisation_or_another_brand_are_refused(): void
    {
        $post = $this->makePost();
        $seen = $post->fresh()->updated_at->toISOString();
        $other = $this->otherOrganization();
        [$second, $secondProfile] = $this->secondBrand();
        $theirPillar = ContentPlannerPillar::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Second brand pillar', 'active' => true]);
        $ourPillar = ContentPlannerPillar::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Ours', 'active' => true]);

        foreach ([$other['pillarId'], $theirPillar->id] as $foreign) {
            $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'pillar_id' => $foreign])
                ->assertStatus(422)->assertJsonValidationErrors('pillar_id');
        }
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'pillar_id' => $ourPillar->id])->assertOk();
    }

    public function test_another_brands_or_organisations_post_does_not_exist_here_and_lists_never_mix_brands(): void
    {
        $other = $this->otherOrganization();
        [$second, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'platform' => 'instagram', 'status' => 'draft', 'topic' => 'Second brand post', 'scheduled_date' => '2026-10-07']);
        $this->makePost(['topic' => 'Our post']);

        $this->asStaffMember()->getJson($this->api("posts/{$other['post']->id}"))->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->asStaffMember()->getJson($this->api("posts/{$theirs->id}"))->assertStatus(404);
        $this->asStaffMember()->getJson($this->api('posts'))->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Our post');
        $this->asStaffMember()->getJson($this->api('posts') . '?brand_id=' . $second)->assertJsonCount(1, 'data')->assertJsonPath('data.0.topic', 'Second brand post');
    }

    public function test_column_limits_and_enums_are_validated_before_postgres_sees_them(): void
    {
        $post = $this->makePost();
        $seen = $post->fresh()->updated_at->toISOString();

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'format' => str_repeat('x', 51), 'hook' => str_repeat('y', 501), 'status' => 'nonsense', 'platform' => 'myspace'])
            ->assertStatus(422)->assertJsonValidationErrors(['format', 'hook', 'status', 'platform']);
        $this->asStaffMember()->postJson($this->api('posts'), ['platform' => 'instagram', 'scheduled_date' => '07/10/2026'])->assertStatus(422)->assertJsonValidationErrors('scheduled_date');
    }

    public function test_a_brand_without_a_profile_cannot_take_posts_but_lists_nothing(): void
    {
        [$second] = $this->secondBrand(withProfile: false);

        $this->asStaffMember()->postJson($this->api('posts') . '?brand_id=' . $second, ['platform' => 'instagram'])->assertStatus(409)->assertJsonPath('error', 'no_profile');
        $this->asStaffMember()->getJson($this->api('posts') . '?brand_id=' . $second)->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_funnel_stage_the_calendar_wrote_in_its_own_words_saves_back(): void
    {
        // The calendar stores the AI's own funnel words (column limit 50), not only the four stages.
        $post = $this->makePost(['funnel_stage' => 'awareness to consideration']);
        $seen = $post->fresh()->updated_at->toISOString();

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'funnel_stage' => 'awareness to consideration', 'hook' => 'Edited'])
            ->assertOk()->assertJsonPath('post.hook', 'Edited');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $post->fresh()->updated_at->toISOString(), 'funnel_stage' => str_repeat('f', 51)])
            ->assertStatus(422)->assertJsonValidationErrors('funnel_stage');
    }

    public function test_audience_and_campaign_ids_of_another_brand_are_refused_on_a_post(): void
    {
        $post = $this->makePost();
        $seen = $post->fresh()->updated_at->toISOString();
        [$second, $secondProfile] = $this->secondBrand();
        $theirAudience = ContentPlannerAudience::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Their audience', 'active' => true]);
        $theirCampaign = ContentPlannerCampaign::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Their campaign', 'status' => 'draft']);

        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'audience_id' => $theirAudience->id])
            ->assertStatus(422)->assertJsonValidationErrors('audience_id');
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['updated_at' => $seen, 'campaign_id' => $theirCampaign->id])
            ->assertStatus(422)->assertJsonValidationErrors('campaign_id');
    }

    public function test_another_organisations_post_cannot_be_moved_copied_deleted_or_written(): void
    {
        $other = $this->otherOrganization();
        $id = $other['post']->id;
        $seen = $other['post']->updated_at->toISOString();

        $this->asStaffMember()->postJson($this->api("posts/{$id}/move"), ['updated_at' => $seen, 'scheduled_date' => null])->assertNotFound();
        $this->asStaffMember()->postJson($this->api("posts/{$id}/duplicate"))->assertNotFound();
        $this->asStaffMember()->deleteJson($this->api("posts/{$id}"))->assertNotFound();
        $this->asStaffMember()->postJson($this->api("posts/{$id}/write"))->assertNotFound();
        $this->assertDatabaseHas('content_planner_posts', ['id' => $id, 'scheduled_date' => '2026-10-07']);
    }
}
