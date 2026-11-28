<?php

namespace Tests\Concerns;

use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ImageGenerationService;
use App\Services\ContentVisualBriefService;
use Illuminate\Support\Facades\Storage;
use Mockery;
use OpenAI\Contracts\ClientContract;
use OpenAI\Contracts\Resources\ImagesContract;
use OpenAI\Responses\Images\CreateResponse;
use ReflectionProperty;

/** Exercises real Content services with local provider transports and fake media storage. */
trait StubsContentPostProviders
{
    protected function stubContentAi(array $data, ?\Closure $during = null): void
    {
        config(['services.anthropic.api_key' => 'test-only', 'services.anthropic.content_planner_model' => 'claude-sonnet-5']);
        $reply = $this->calendarReply([]);
        $reply['content'][0]['text'] = json_encode($data);
        $transport = new class ($reply, $during) implements \Psr\Http\Client\ClientInterface {
            public function __construct(private array $reply, private ?\Closure $during) {}
            public function sendRequest(\Psr\Http\Message\RequestInterface $request): \Psr\Http\Message\ResponseInterface
            {
                if ($this->during) ($this->during)();
                return new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode($this->reply));
            }
        };
        $ai = new AiClient;
        (new ReflectionProperty($ai, 'client'))->setValue($ai, new \Anthropic\Client(apiKey: 'test-only', requestOptions: ['maxRetries' => 0, 'transporter' => $transport], openTelemetry: false));
        $this->app->instance(AiClient::class, $ai);
    }

    protected function stubContentImage(?\Closure $during = null, bool $fail = false): void
    {
        Storage::fake('public');
        config(['filesystems.media_disk' => 'public', 'openai.api_key' => 'test-only', 'openai.image_model' => 'gpt-image-1', 'openai.image_fallback_model' => '']);
        $images = Mockery::mock(ImagesContract::class);
        $images->shouldReceive('create')->once()->andReturnUsing(function () use ($during, $fail) {
            if ($during) $during();
            if ($fail) throw new \RuntimeException('PRIVATE_PROVIDER_SENTINEL');
            return CreateResponse::from(['created' => 1, 'data' => [['b64_json' => base64_encode('test image')]]], \OpenAI\Responses\Meta\MetaInformation::from([]));
        });
        $client = Mockery::mock(ClientContract::class);
        $client->shouldReceive('images')->andReturn($images);
        $service = new ImageGenerationService(Mockery::mock(ContentVisualBriefService::class));
        (new ReflectionProperty($service, 'client'))->setValue($service, $client);
        $this->app->instance(ImageGenerationService::class, $service);
    }

}
