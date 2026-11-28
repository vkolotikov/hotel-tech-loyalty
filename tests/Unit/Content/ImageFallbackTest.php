<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentRefused;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentVisualBriefService;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use OpenAI\Contracts\ClientContract;
use OpenAI\Contracts\Resources\ImagesContract;
use OpenAI\Exceptions\ErrorException;
use ReflectionMethod;
use ReflectionProperty;
use RuntimeException;
use Tests\TestCase;

/**
 * The Content Planner's image fallback. OpenAI shut DALL·E down on 2026-05-12, so the old default fallback
 * ('dall-e-3') could only fail: there is no fallback unless one is configured, and the error text names the
 * real remedy instead of the retired model.
 */
class ImageFallbackTest extends TestCase
{
    use DatabaseTransactions, \Tests\Concerns\SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function service(ImagesContract $images): ImageGenerationService
    {
        $client = Mockery::mock(ClientContract::class);
        $client->shouldReceive('images')->andReturn($images);
        $service = new ImageGenerationService(Mockery::mock(ContentVisualBriefService::class));
        (new ReflectionProperty($service, 'client'))->setValue($service, $client);

        return $service;
    }

    private function createImage(ImageGenerationService $service): array
    {
        return (new ReflectionMethod($service, 'createImage'))->invoke($service, 'gpt-image-2.6-sunburst', 'A calm lobby.', '1024x1024', '1:1', (int) $this->org->id);
    }

    public function test_without_a_configured_fallback_an_access_error_is_not_retried(): void
    {
        $this->assertSame('', config('openai.image_fallback_model'));
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->with(Mockery::on(fn ($p) => $p['model'] === 'gpt-image-2.6-sunburst'))
            ->andThrow(new ErrorException(['message' => 'Your organization must be verified to use the model gpt-image-1.'], new Response(403)));

        $this->expectExceptionMessage('must be verified');
        $this->createImage($this->service($images));
    }

    public function test_a_configured_fallback_is_tried_once_with_gpt_image_parameters(): void
    {
        config(['openai.image_fallback_model' => 'gpt-image-1-mini']);
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->with(Mockery::on(fn ($p) => $p['model'] === 'gpt-image-2.6-sunburst'))
            ->andThrow(new ErrorException(['message' => 'The model gpt-image-1 does not have access for this project.'], new Response(403)));
        $images->shouldReceive('create')->once()->with(Mockery::on(fn ($p) => $p['model'] === 'gpt-image-2.6-flare'
            && $p['size'] === '1024x1024' && $p['quality'] === 'high' && ! isset($p['response_format'])))
            ->andThrow(new RuntimeException('fallback reached'));

        $this->expectExceptionMessage('fallback reached');
        $this->createImage($this->service($images));
    }

    public function test_the_access_error_text_names_no_retired_model(): void
    {
        $service = $this->service(Mockery::mock(ImagesContract::class));
        $text = (new ReflectionMethod($service, 'friendlyError'))->invoke($service, 'Your organization must be verified to use the model gpt-image-1. PRIVATE_SENTINEL');

        $this->assertStringNotContainsString('dall-e', $text);
        $this->assertStringContainsString('verified organisation', $text);
        $this->assertStringNotContainsString('PRIVATE_SENTINEL', $text);
    }

    public function test_an_ambiguous_transport_failure_never_starts_a_paid_fallback(): void
    {
        config(['openai.image_fallback_model' => 'gpt-image-1-mini']);
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->andThrow(new RuntimeException('gpt-image-1 request timed out after upload'));
        $this->expectExceptionMessage('timed out');
        $this->createImage($this->service($images));
    }

    public function test_request_moderation_quota_and_server_failures_never_fallback(): void
    {
        config(['openai.image_fallback_model' => 'gpt-image-1-mini']);
        foreach ([
            [400, 'moderation_blocked', 'gpt-image request rejected by safety system'],
            [400, 'invalid_request_error', 'Unsupported quality for gpt-image'],
            [400, 'invalid_prompt', 'Invalid prompt for gpt-image'],
            [403, 'insufficient_quota', 'Verify your organization billing quota'],
            [500, null, 'Organization must be verified'],
        ] as [$status, $code, $message]) {
            $images = Mockery::mock(ImagesContract::class);
            $error = new ErrorException(['message' => $message, 'code' => $code], new Response($status));
            $images->shouldReceive('create')->once()->andThrow($error);
            try {
                $this->createImage($this->service($images));
                $this->fail('Expected provider refusal');
            } catch (\Throwable $e) {
                $this->assertSame($error, $e);
            }
        }
    }

    public function test_unknown_fallback_is_refused_without_its_provider_call(): void
    {
        config(['openai.image_fallback_model' => 'PRIVATE_UNKNOWN']);
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->andThrow(new ErrorException(['message' => 'Organization must be verified'], new Response(403)));
        try {
            $this->createImage($this->service($images));
            $this->fail('Expected local refusal');
        } catch (ContentRefused $e) {
            $this->assertSame('ai_model_unpriced', $e->errorCode);
        }
    }

    public function test_all_legacy_fallbacks_deduplicate_after_canonicalization(): void
    {
        foreach (['gpt-image-1', 'gpt-image-1.5', 'gpt-image-1.5-2025-12-16', 'chatgpt-image-latest', 'dall-e-2', 'dall-e-3', 'gpt-image-1-mini'] as $alias) {
            config(['openai.image_fallback_model' => $alias]);
            $images = Mockery::mock(ImagesContract::class);
            $error = new ErrorException(['message' => 'Organization must be verified'], new Response(403));
            $images->shouldReceive('create')->once()->andThrow($error);
            try {
                (new ReflectionMethod(ImageGenerationService::class, 'createImage'))->invoke($this->service($images), 'gpt-image-2.6-flare', 'Garden', '1024x1024', '1:1', (int) $this->org->id);
                $this->fail('Expected original refusal');
            } catch (\Throwable $e) {
                $this->assertSame($error, $e);
            }
        }
    }
}
