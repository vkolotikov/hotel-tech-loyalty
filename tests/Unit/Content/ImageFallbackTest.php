<?php

namespace Tests\Unit\Content;

use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentVisualBriefService;
use Mockery;
use OpenAI\Contracts\ClientContract;
use OpenAI\Contracts\Resources\ImagesContract;
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
        return (new ReflectionMethod($service, 'createImage'))->invoke($service, 'gpt-image-1', 'A calm lobby.', '1024x1024', '1:1');
    }

    public function test_without_a_configured_fallback_an_access_error_is_not_retried(): void
    {
        $this->assertSame('', config('openai.image_fallback_model'));
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->with(Mockery::on(fn ($p) => $p['model'] === 'gpt-image-1'))
            ->andThrow(new RuntimeException('Your organization must be verified to use the model gpt-image-1.'));

        $this->expectExceptionMessage('must be verified');
        $this->createImage($this->service($images));
    }

    public function test_a_configured_fallback_is_tried_once_with_gpt_image_parameters(): void
    {
        config(['openai.image_fallback_model' => 'gpt-image-1-mini']);
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->with(Mockery::on(fn ($p) => $p['model'] === 'gpt-image-1'))
            ->andThrow(new RuntimeException('The model gpt-image-1 does not have access for this project.'));
        $images->shouldReceive('create')->once()->with(Mockery::on(fn ($p) => $p['model'] === 'gpt-image-1-mini'
            && $p['size'] === '1024x1024' && $p['quality'] === 'high' && ! isset($p['response_format'])))
            ->andThrow(new RuntimeException('fallback reached'));

        $this->expectExceptionMessage('fallback reached');
        $this->createImage($this->service($images));
    }

    public function test_the_access_error_text_names_no_retired_model(): void
    {
        $service = $this->service(Mockery::mock(ImagesContract::class));
        $text = (new ReflectionMethod($service, 'friendlyError'))->invoke($service, 'Your organization must be verified to use the model gpt-image-1.');

        $this->assertStringNotContainsString('dall-e', $text);
        $this->assertStringContainsString('verified organisation', $text);
    }
}
