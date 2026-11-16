<?php

namespace Tests\Feature\Content;

use App\Jobs\AdaptPostVersions;
use App\Jobs\RunContentWork;
use App\Models\ContentPlannerAiGeneration;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\ContentWork;
use App\Services\AiUsageService;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\ContentSiteScan;
use App\Services\Content\ContentVersionAdapter;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentVisualBriefService;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;
use Tests\Concerns\SetsUpContentSchema;
use Tests\Concerns\StubsContentPostProviders;
use Tests\TestCase;

class CurrentProviderTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, StubsContentPostProviders, \Tests\Concerns\FakesWebsite;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        if (! Schema::hasTable('content_work')) {
            (require database_path('migrations/2026_11_13_110000_create_content_work.php'))->up();
        }
        Http::preventStrayRequests();
        Queue::fake();
        Storage::fake('public');
        config(['filesystems.media_disk' => 'public', 'openai.api_key' => 'test-only']);
    }

    public function test_default_and_every_legacy_primary_use_current_models_through_real_sdk_http(): void
    {
        $this->assertSame('gpt-image-2.6-sunburst', config('openai.image_model'));
        $aliases = ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-1.5-2025-12-16', 'chatgpt-image-latest', 'dall-e-2', 'dall-e-3', 'gpt-image-1-mini', 'gpt-image-2.6-flare'];
        foreach ($aliases as $index => $alias) {
            config(['openai.image_model' => $alias]);
            $aspect = ['1:1', '9:16', '16:9'][$index % 3];
            $post = $this->makePost();
            ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Quiet garden', 'aspect_ratio' => $aspect]);
            $expected = in_array($alias, ['gpt-image-1-mini', 'gpt-image-2.6-flare']) ? 'gpt-image-2.6-flare' : 'gpt-image-2.6-sunburst';
            $transport = new class($this, $expected, ['1024x1024', '1024x1536', '1536x1024'][$index % 3]) implements ClientInterface
            {
                public int $calls = 0;

                public function __construct(private $test, private string $model, private string $size) {}

                public function sendRequest(RequestInterface $request): ResponseInterface
                {
                    $this->calls++;
                    $this->test->assertSame('/v1/images/generations', $request->getUri()->getPath());
                    $body = json_decode((string) $request->getBody(), true);
                    $this->test->assertSame([$this->model, $this->size, 'high', 'png', 1], [$body['model'], $body['size'], $body['quality'], $body['output_format'] ?? null, $body['n']]);
                    $this->test->assertArrayNotHasKey('response_format', $body);

                    return new Response(200, ['Content-Type' => 'application/json'], json_encode(['created' => 1, 'data' => [['b64_json' => base64_encode('local png fixture')]], 'usage' => ['total_tokens' => 6000, 'input_tokens' => 3000, 'output_tokens' => 3000, 'input_tokens_details' => ['text_tokens' => 1000, 'image_tokens' => 2000]]]));
                }
            };
            $brief = (new ImageGenerationService(app(ContentVisualBriefService::class), null, $transport))->generateForPost($post);
            $this->assertSame($expected, $brief->image_model);
            $this->assertSame(1, $transport->calls);
            $row = DB::table('ai_usage_logs')->latest('id')->first();
            $this->assertSame([3000, 3000, 12], [(int) $row->input_tokens, (int) $row->output_tokens, (int) $row->cost_cents]);
            $generation = ContentPlannerAiGeneration::latest('id')->first();
            $this->assertEquals(0.111, $generation->cost_estimate);
            $this->assertSame(3000, $generation->tokens_input);
            $this->assertSame(3000, $generation->tokens_output);
            $this->assertSame(['text_tokens' => 1000, 'image_tokens' => 2000], $generation->response_json['usage']['input_tokens_details']);
        }
    }

    public function test_image_price_breakdown_and_conservative_incomplete_usage(): void
    {
        $service = app(AiUsageService::class);
        $cases = [
            [['input_tokens' => 1000000, 'output_tokens' => 1000000, 'input_tokens_details' => ['text_tokens' => 1000000, 'image_tokens' => 0]], '1024x1024', 3500, 1000000, 1000000],
            [['input_tokens' => 1000000, 'output_tokens' => 1000000, 'input_tokens_details' => ['text_tokens' => 0, 'image_tokens' => 1000000]], '1024x1024', 3800, 1000000, 1000000],
            [null, '1024x1024', 6, 4, 1756],
            [[], '1024x1536', 5, 4, 1372],
            [['input_tokens' => 0, 'output_tokens' => 0, 'input_tokens_details' => ['text_tokens' => 0, 'image_tokens' => 0]], '1536x1024', 5, 4, 1372],
            [['input_tokens' => 10000, 'output_tokens' => 1], '1024x1024', 14, 10000, 1756],
            [['input_tokens' => -2, 'output_tokens' => 'bad', 'input_tokens_details' => ['text_tokens' => -10]], '1024x1024', 6, 4, 1756],
            [['input_tokens' => 1, 'output_tokens' => 1, 'input_tokens_details' => ['text_tokens' => 1, 'image_tokens' => 0]], '1024x1024', 1, 1, 1],
        ];
        foreach (['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare'] as $model) {
            foreach ($cases as [$usage, $size, $cost, $input, $output]) {
                $service->recordImage($this->org->id, $model, $size, 'content', $usage, 'éé');
                $row = DB::table('ai_usage_logs')->latest('id')->first();
                $this->assertSame([$cost, $input, $output], [(int) $row->cost_cents, (int) $row->input_tokens, (int) $row->output_tokens]);
            }
        }
    }

    public function test_missing_text_usage_is_estimated_in_addition_to_known_image_input(): void
    {
        $cost = app(AiUsageService::class)->imageCost('gpt-image-2.6-sunburst', '1024x1024', [
            'input_tokens' => 1000000, 'output_tokens' => 1756,
            'input_tokens_details' => ['image_tokens' => 1000000],
        ], str_repeat('é', 500));
        $this->assertSame(1000, $cost['text_tokens']);
        $this->assertSame(1001000, $cost['input_tokens']);
        $this->assertSame(806, $cost['cost_cents']);
        $this->assertTrue($cost['estimated']);
    }

    public function test_malformed_wire_usage_preserves_the_successful_image_and_estimates_spend(): void
    {
        foreach ([null, [], 'invalid', ['total_tokens' => 'bad', 'input_tokens' => -1, 'output_tokens' => [], 'input_tokens_details' => 'bad']] as $usage) {
            $transport = new class($usage) implements ClientInterface
            {
                public function __construct(private mixed $usage) {}

                public function sendRequest(RequestInterface $request): ResponseInterface
                {
                    return new Response(200, ['Content-Type' => 'application/json'], json_encode(['created' => 1, 'data' => [['b64_json' => base64_encode('fixture')]], 'usage' => $this->usage]));
                }
            };
            $post = $this->makePost();
            ContentPlannerVisualBrief::create(['post_id' => $post->id, 'scene' => 'Garden']);
            $service = new ImageGenerationService(app(ContentVisualBriefService::class), null, $transport);
            $brief = $service->generateForPost($post);
            $this->assertSame('ready', $brief->image_status);
            $row = DB::table('ai_usage_logs')->latest('id')->first();
            $this->assertSame(1756, (int) $row->output_tokens);
            $this->assertGreaterThan(0, (int) $row->cost_cents);
        }
    }

    public function test_unknown_models_refuse_legacy_and_work_including_fill_before_any_provider(): void
    {
        $calls = 0;
        $this->stubContentAi([], function () use (&$calls) {
            $calls++;
        });
        $ai = app(AiClient::class);
        (new \ReflectionProperty($ai, 'model'))->setValue($ai, 'PRIVATE_UNPRICED');
        foreach (['write', 'image', 'fill'] as $action) {
            (new \ReflectionProperty($ai, 'model'))->setValue($ai, $action === 'image' ? 'claude-sonnet-5' : 'PRIVATE_UNPRICED');
            $post = $this->makePost();
            config(['openai.image_model' => 'PRIVATE_UNPRICED']);
            $path = $action === 'fill' ? 'slots/fill' : "posts/{$post->id}/{$action}";
            $input = $action === 'fill' ? ['date' => '2026-10-05', 'platform' => 'instagram'] : [];
            $response = $this->asManager()->postJson($this->api($path), $input)->assertStatus(502)->assertJsonPath('error', 'ai_model_unpriced');
            $this->assertStringNotContainsString('PRIVATE_UNPRICED', $response->getContent());
            $input += ['action' => $action, 'request_key' => $action];
            if ($action !== 'fill') {
                $input['post_id'] = $post->id;
            }
            $id = $this->postJson($this->api('work'), $input)->assertStatus(202)->json('work.id');
            (new RunContentWork($id))->handle();
            $this->assertSame('ai_model_unpriced', ContentWork::findOrFail($id)->error);
        }
        $this->assertSame(0, $calls);
        $this->assertSame(0, DB::table('ai_usage_logs')->count());
    }

    public function test_mapped_claude_rates_and_haiku_tier_boundary(): void
    {
        foreach (['claude-sonnet-5' => 1200, 'claude-fable-5' => 6000, 'claude-opus-4-6' => 3000, 'claude-opus-4-7' => 3000, 'claude-opus-4-7[1m]' => 3000, 'claude-haiku-5-5' => 300] as $model => $cost) {
            app(AiUsageService::class)->recordUsage($this->org->id, $model, 1000000, 1000000, 'content');
            $this->assertSame($cost, (int) DB::table('ai_usage_logs')->latest('id')->value('cost_cents'));
        }
        foreach ([100000 => 51, 100001 => 256] as $input => $cost) {
            app(AiUsageService::class)->recordUsage($this->org->id, 'claude-haiku-5-5', $input, 1000000, 'content');
            $this->assertSame($cost, (int) DB::table('ai_usage_logs')->latest('id')->value('cost_cents'));
        }
    }

    public function test_text_diagnostic_uses_the_same_current_rates_as_the_ledger(): void
    {
        $this->stubContentAi(['hook' => 'Garden']);
        app(AiClient::class)->generateJson($this->profile, 'post', 'Garden');
        $row = ContentPlannerAiGeneration::latest('id')->first();
        $this->assertSame('claude-sonnet-5', $row->model);
        $this->assertEquals(0.0003, $row->cost_estimate); // 20 * $2 + 30 * $10 per million, diagnostic rounded to 4 decimals
        $this->assertSame(1, (int) DB::table('ai_usage_logs')->latest('id')->value('cost_cents'));
    }

    public function test_unpriced_model_is_preserved_by_version_results(): void
    {
        $calls = 0;
        $this->stubContentAi([], function () use (&$calls) {
            $calls++;
        });
        (new \ReflectionProperty(AiClient::class, 'model'))->setValue(app(AiClient::class), 'PRIVATE_UNPRICED');
        $post = $this->makePost(['hook' => 'My original']);
        $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => true])->assertCreated();
        Queue::pushed(AdaptPostVersions::class)->first()->handle(app(ContentVersionAdapter::class), app(ContentAiGate::class));
        $this->getJson($this->api("posts/{$post->id}"))->assertOk()->assertJsonPath('post.group.kept_reason', 'ai_model_unpriced');
        $this->assertSame(0, $calls);
        $this->assertSame(['My original'], ContentPlannerPost::pluck('hook')->unique()->all());
    }

    public function test_unpriced_model_is_preserved_by_website_summary_results(): void
    {
        $calls = 0;
        $this->stubContentAi([], function () use (&$calls) {
            $calls++;
        });
        (new \ReflectionProperty(AiClient::class, 'model'))->setValue(app(AiClient::class), 'PRIVATE_UNPRICED');
        $this->fakeWebsite(['https://lumiere.example/' => '<html><head><title>Garden</title></head><body><main>A peaceful garden for visitors.</main></body></html>']);
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'scanning', 'scan_token' => 'test', 'scan_queued_at' => now()]);
        app(ContentSiteScan::class)->run($site, 'test', true);
        $this->assertSame('ai_model_unpriced', $site->fresh()->summary_note);
        $this->assertSame('ready', $site->fresh()->status);
        $this->assertSame(0, $calls);
    }

    public function test_unpriced_model_is_preserved_by_promotion_results(): void
    {
        $calls = 0;
        $this->stubContentAi([], function () use (&$calls) {
            $calls++;
        });
        (new \ReflectionProperty(AiClient::class, 'model'))->setValue(app(AiClient::class), 'PRIVATE_UNPRICED');
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready']);
        $page = ContentSitePage::create(['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example/', 'url_hash' => hash('sha256', 'https://lumiere.example/'), 'kind' => 'page', 'title' => 'Garden', 'body' => 'A peaceful garden']);
        $row = ContentPromotion::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $page->id, 'batch' => 'test', 'status' => 'writing', 'posts_wanted' => 1, 'created_by' => $this->manager->id, 'slots' => [['platform' => 'instagram', 'date' => '2026-10-05', 'time' => '09:00']]]);
        app(ContentPromotionPosts::class)->write($row);
        $this->assertSame('ai_model_unpriced', $row->fresh()->error);
        $this->assertSame('failed', $row->fresh()->status);
        $this->assertSame(0, ContentPlannerPost::count());
        $this->assertSame(0, $calls);
    }
}
