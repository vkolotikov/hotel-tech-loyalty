<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerAudience;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerProfile;
use App\Services\ContentKnowledgeService;
use App\Services\ContentPlanner\ProfileBootstrapService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

class BrandTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_reading_the_brand_writes_nothing_and_saving_a_section_rescores_it(): void
    {
        $this->profile->forceFill(['knowledge_score' => 7])->save();

        $this->asStaffMember()->getJson($this->api('brand'))
            ->assertOk()
            ->assertJsonPath('profile.name', 'Lumière content')
            ->assertJsonCount(2, 'channels')
            ->assertJsonStructure(['readiness' => ['overall', 'sections']]);
        $this->assertSame(7, (int) $this->profile->fresh()->knowledge_score);

        $this->asManager()->putJson($this->api('brand/profile'), ['usp' => 'Organic colour only', 'price_position' => 'premium'])
            ->assertOk()
            ->assertJsonPath('profile.usp', 'Organic colour only');
        $this->assertNotSame(7, (int) $this->profile->fresh()->knowledge_score);
    }

    public function test_readiness_names_each_gap_by_a_code_the_portal_words(): void
    {
        $this->profile->audiences()->delete();

        $sections = collect($this->asStaffMember()->getJson($this->api('brand'))->assertOk()->json('readiness.sections'))->keyBy('key');

        $this->assertSame(['company', 'knowledge', 'audience', 'voice', 'channels', 'strategy_inputs'], $sections->keys()->all());
        foreach ($sections as $key => $section) {
            $this->assertCount(count($section['hints']), $section['missing'], "{$key}: one code per hint");
            foreach ($section['missing'] as $code) {
                $this->assertContains($code, ContentKnowledgeService::GAPS, "{$key}: {$code}");
            }
        }
        $this->assertSame(['audience_none'], $sections['audience']['missing']);
        $this->assertIsInt($sections['knowledge']['faq_count']);
    }

    public function test_the_portal_words_every_readiness_gap_and_nothing_else(): void
    {
        $words = json_decode((string) file_get_contents(base_path('frontend/src/content/i18n/content.en.json')), true);

        $portal = array_keys($words['brand']['gap'] ?? []);
        $server = ContentKnowledgeService::GAPS;
        sort($portal);
        sort($server);
        $this->assertSame($server, $portal, 'content.brand.gap in the English bundle must name exactly ContentKnowledgeService::GAPS');
    }

    public function test_staff_read_the_brand_but_may_not_change_it(): void
    {
        $this->asStaffMember()->putJson($this->api('brand/profile'), ['usp' => 'x'])->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->postJson($this->api('brand/audiences'), ['name' => 'x'])->assertStatus(403);
        $this->asStaffMember()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])->assertStatus(403);
        $this->asStaffMember()->postJson($this->api('brand/refresh-knowledge'))->assertStatus(403);
    }

    public function test_an_audience_is_edited_in_place_and_removing_one_in_use_asks_first(): void
    {
        $id = $this->asManager()->postJson($this->api('brand/audiences'), ['name' => 'Busy professionals', 'pain_points' => ['No time']])
            ->assertCreated()->json('audience.id');
        $post = $this->makePost(['audience_id' => $id]);

        $this->asManager()->putJson($this->api("brand/audiences/{$id}"), ['name' => 'Busy professionals 30+'])
            ->assertOk()->assertJsonPath('audience.id', $id)->assertJsonPath('audience.name', 'Busy professionals 30+');
        $this->assertSame($id, (int) $post->fresh()->audience_id);
        $this->asManager()->getJson($this->api('brand'))->assertJsonPath('audiences.0.posts_count', 1);

        $this->asManager()->deleteJson($this->api("brand/audiences/{$id}"))
            ->assertStatus(409)->assertJsonPath('error', 'audience_in_use')->assertJsonPath('posts', 1);
        $this->asManager()->deleteJson($this->api("brand/audiences/{$id}") . '?confirm=1')->assertOk();
        $this->assertNull(ContentPlannerAudience::find($id));
        $this->assertNull($post->fresh()->audience_id);
        $this->assertSame('Autumn colours', $post->fresh()->topic);
    }

    public function test_channels_and_the_voice_are_edited_in_place(): void
    {
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'instagram')->first();

        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), ['frequency' => ['mon' => false, 'tue' => true, 'wed' => true, 'thu' => false, 'fri' => true, 'sat' => true, 'sun' => false], 'posts_per_week' => 4])
            ->assertOk()->assertJsonPath('channel.id', $channel->id)->assertJsonPath('channel.posts_per_week', 4);
        $new = $this->asManager()->postJson($this->api('brand/channels'), ['platform' => 'tiktok', 'label' => 'TikTok'])->assertCreated()->json('channel.id');
        $this->asManager()->postJson($this->api('brand/channels'), ['platform' => 'myspace', 'label' => 'x'])->assertStatus(422);
        $this->asManager()->deleteJson($this->api("brand/channels/{$new}"))->assertOk();

        $this->asManager()->putJson($this->api('brand/voice'), ['tone' => 'warm', 'forbidden_words' => ['cheap']])->assertOk()->assertJsonPath('voice.tone', 'warm');
        $this->asManager()->putJson($this->api('brand/voice'), ['tone' => 'calm'])->assertOk()->assertJsonPath('voice.tone', 'calm')->assertJsonPath('voice.forbidden_words', ['cheap']);
        $this->assertSame(1, $this->profile->brandVoices()->count());
    }

    public function test_ids_of_another_brand_are_refused(): void
    {
        [$second, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerAudience::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $second, 'name' => 'Theirs', 'active' => true]);

        $this->asManager()->putJson($this->api("brand/audiences/{$theirs->id}"), ['name' => 'Taken'])->assertStatus(404);
        $this->asManager()->postJson($this->api('brand/channels'), ['platform' => 'tiktok', 'label' => 'TikTok', 'audience_id' => $theirs->id])->assertStatus(422);
    }

    public function test_a_new_brand_gets_its_profile_from_the_first_section_saved_and_the_setup_finishes(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $q = '?brand_id=' . $second;

        $this->asManager()->getJson($this->api('brand') . $q)->assertOk()->assertJsonPath('profile', null);
        $this->asManager()->putJson($this->api('brand/profile') . $q, ['brand_summary' => 'A calm studio'])->assertOk()->assertJsonPath('profile.setup_completed_at', null);
        $this->asManager()->postJson($this->api('brand/setup') . $q)->assertOk();
        $this->assertNotNull(ContentPlannerProfile::where('brand_id', $second)->first()->setup_completed_at);
    }

    public function test_quick_setup_fills_an_empty_brand_with_ai_strings_cut_to_their_columns(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $bootstrap = Mockery::mock(ProfileBootstrapService::class);
        $bootstrap->shouldReceive('bootstrap')->once()->andReturn([
            'payload' => [
                'name' => 'Second Studio plan', 'default_tone' => str_repeat('t', 150), 'price_position' => str_repeat('p', 80),
                'audiences' => [['name' => 'Locals', 'is_ai_assumed' => true]],
                'channels' => [['platform' => 'instagram', 'audience_index' => 0, 'frequency' => ['mon' => true], 'emoji_policy' => str_repeat('e', 70)], ['platform' => 'myspace']],
                'brand_voice' => ['tone' => 'friendly'],
            ],
            'assumptions' => ['We assumed a local audience.'],
        ]);
        $this->app->instance(ProfileBootstrapService::class, $bootstrap);

        $this->asManager()->postJson($this->api('brand/quick-setup') . '?brand_id=' . $second, ['platforms' => ['instagram'], 'intensity' => 'standard'])
            ->assertCreated()
            ->assertJsonPath('assumptions', ['We assumed a local audience.'])
            ->assertJsonCount(1, 'channels')
            ->assertJsonPath('audiences.0.name', 'Locals')
            ->assertJsonPath('voice.tone', 'friendly');

        $profile = ContentPlannerProfile::where('brand_id', $second)->first();
        $this->assertSame(100, mb_strlen($profile->default_tone));
        $this->assertSame(50, mb_strlen($profile->price_position));
        $this->assertSame(50, mb_strlen($profile->channels()->first()->emoji_policy));
        $this->assertNotNull($profile->setup_completed_at);
        $this->assertSame((int) $profile->audiences()->first()->id, (int) $profile->channels()->first()->audience_id);
    }

    public function test_quick_setup_is_for_a_brand_not_yet_set_up_and_refresh_reads_the_knowledge_again(): void
    {
        $this->asManager()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])->assertStatus(409)->assertJsonPath('error', 'already_set_up');

        $this->asManager()->postJson($this->api('brand/refresh-knowledge'))->assertOk();
        $this->assertSame('Test business context.', $this->profile->fresh()->knowledge_summary_short);
    }

    public function test_text_the_ai_wrote_into_wide_columns_saves_back_unchanged(): void
    {
        // These columns are text since the July widening; quick setup joins AI lists with ", " into them.
        $long = str_repeat('Busy parents, ', 25) . 'and locals';
        $audience = ContentPlannerAudience::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Locals', 'active' => true, 'industry' => $long]);
        $channel = ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->firstOrFail();

        $this->asManager()->putJson($this->api("brand/audiences/{$audience->id}"), [
            'name' => 'Locals', 'industry' => $long, 'country' => $long, 'business_size' => $long, 'job_role' => $long, 'preferred_tone' => $long,
        ])->assertOk();
        $this->asManager()->putJson($this->api("brand/channels/{$channel->id}"), [
            'goal' => $long, 'role' => $long, 'cta_style' => $long, 'visual_style' => $long, 'link_policy' => $long, 'tone_override' => $long,
        ])->assertOk();
        $this->assertSame($long, $channel->fresh()->tone_override);
    }

    public function test_quick_setup_keeps_what_a_manager_already_typed(): void
    {
        [$second] = $this->secondBrand(withProfile: false);
        $q = '?brand_id=' . $second;
        // A guided setup begun first: two sections typed, not finished.
        $this->asManager()->putJson($this->api('brand/profile') . $q, ['usp' => 'Organic colour only', 'content_mix' => ['education' => 60]])->assertOk();

        $bootstrap = Mockery::mock(ProfileBootstrapService::class);
        $bootstrap->shouldReceive('bootstrap')->once()->andReturn([
            'payload' => ['name' => 'AI name', 'usp' => 'AI usp', 'brand_summary' => 'AI summary', 'content_mix' => null],
            'assumptions' => [],
        ]);
        $this->app->instance(ProfileBootstrapService::class, $bootstrap);

        $this->asManager()->postJson($this->api('brand/quick-setup') . $q, ['name' => 'Second Studio content', 'platforms' => ['instagram']])->assertCreated();

        $profile = ContentPlannerProfile::where('brand_id', $second)->first();
        $this->assertSame('Organic colour only', $profile->usp);          // typed: kept
        $this->assertSame(['education' => 60], $profile->content_mix);    // an AI blank never wipes
        $this->assertSame('AI summary', $profile->brand_summary);         // empty: filled
        $this->assertSame('Second Studio content', $profile->name);       // given in the quick setup form: applied
        $this->assertNotNull($profile->setup_completed_at);
    }

    public function test_a_quick_setup_failure_never_shows_the_providers_words_and_two_cannot_run_at_once(): void
    {
        $this->profile->forceFill(['setup_completed_at' => null])->save();
        $bootstrap = Mockery::mock(ProfileBootstrapService::class);
        $bootstrap->shouldReceive('bootstrap')->once()->andThrow(new \RuntimeException('Private provider detail'));
        $this->app->instance(ProfileBootstrapService::class, $bootstrap);

        $this->asManager()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])
            ->assertStatus(502)->assertJsonPath('error', 'ai_failed')->assertDontSee('Private provider detail');

        config()->set('cache.stores.content_shared_test', ['driver' => 'array']);
        config()->set('cache.shared', 'content_shared_test');
        $held = Cache::store('content_shared_test')->lock("content:quick-setup:{$this->org->id}:{$this->brandId}", 600);
        $this->assertTrue($held->get());
        $this->asManager()->postJson($this->api('brand/quick-setup'), ['platforms' => ['instagram']])
            ->assertStatus(409)->assertJsonPath('error', 'already_generating');
        $held->release();
    }
}
