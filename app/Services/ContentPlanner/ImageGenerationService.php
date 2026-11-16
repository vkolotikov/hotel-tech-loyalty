<?php

namespace App\Services\ContentPlanner;

use App\Models\ContentPlannerAiGeneration;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use App\Services\AiUsageService;
use App\Services\ContentVisualBriefService;
use App\Services\MediaService;
use App\Services\Content\ContentPostWrites;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Facades\Log;
use OpenAI\Contracts\ClientContract;

/**
 * Generates a PNG using the current OpenAI model, with an optional configured
 * alternative only after a definite model-access/verification refusal. The
 * prompt comes from the post's visual brief (image_prompt_future) plus the
 * brand's visual style; the resulting image is stored via MediaService and
 * its URL saved on the visual brief.
 */
class ImageGenerationService
{
    public function __construct(
        protected ContentVisualBriefService $visualBriefService,
        private ?ClientContract $client = null,
        private ?\Psr\Http\Client\ClientInterface $http = null,
    ) {
    }

    /**
     * Generate (or regenerate) the image for a post.
     * Ensures a visual brief exists first (generating one if needed).
     */
    public function generateForPost(ContentPlannerPost $post, ?string $instructions = null): ContentPlannerVisualBrief
    {
        // Refuse unusable image configuration before spending on a missing brief.
        ContentModels::assertImage($this->model());
        $profile = $post->profile;
        if (!$profile) {
            throw new \RuntimeException('Post has no planner profile.');
        }

        if (!$this->apiKey()) {
            throw new \RuntimeException('OpenAI is not configured. Add OPENAI_API_KEY to enable image generation.');
        }

        // A visual brief (recommendation + prompt) must come first.
        $brief = $post->visualBrief;
        if (!$brief || (!$brief->image_prompt_future && !$brief->scene)) {
            $brief = $this->visualBriefService->generateFor($post);
        }

        $prompt = $this->buildImagePrompt($post, $brief, $profile, $instructions);
        $size = $this->sizeForModel($this->model(), $brief->aspect_ratio);

        try {
            [$bytes, $modelUsed, $cost, $usage] = $this->createImage($this->model(), $prompt, $size, $brief->aspect_ratio, (int)$profile->organization_id);
        } catch (\App\Services\Content\ContentRefused $e) {
            throw $e;
        } catch (\Throwable $e) {
            $this->logGeneration($post, null, 'error', $e->getMessage());
            app(ContentPostWrites::class)->apply($post, function (ContentPlannerPost $current) {
                $current->visualBrief()->firstOrFail()->update([
                    'image_status' => 'failed',
                    'image_error' => 'ai_failed',
                ]);
            });
            throw new \RuntimeException($this->friendlyError($e->getMessage()), previous: $e);
        }

        // The paid picture counts even if its commit loses a race or storage fails.
        $this->logGeneration($post, $modelUsed, 'success', null, $cost, $usage);
        $url = MediaService::putRaw($bytes, 'content-planner/images', 'png');

        app(ContentPostWrites::class)->apply($post, function (ContentPlannerPost $current) use ($url, $modelUsed, &$brief) {
            $brief = $current->visualBrief()->firstOrFail();
            $brief->update([
                'image_url' => $url,
                'image_status' => 'ready',
                'image_model' => $modelUsed,
                'image_error' => null,
                'image_generated_at' => now(),
            ]);
            ContentPostWrites::visualChanged($current);
        });

        return $brief->fresh();
    }

    /**
     * Call OpenAI images, trying the primary model then the fallback on an
     * access/verification error. Returns [rawBytes, modelUsed].
     */
    private function createImage(string $model, string $prompt, string $size, ?string $aspect, int $orgId): array
    {
        try {
            [$bytes, $cost, $usage] = $this->paidImage($orgId, $model, $prompt, $size);
            return [$bytes, $model, $cost, $usage];
        } catch (\Throwable $e) {
            $fallback = ContentModels::image((string) config('openai.image_fallback_model', ''), true);
            if ($e instanceof \OpenAI\Exceptions\ErrorException && in_array($e->getStatusCode(), [400,403,404], true)
                && $fallback && $fallback !== $model && $this->isModelAccessError($e)) {
                Log::warning("Content Planner image: {$model} unavailable, falling back to {$fallback}", [
                    'error' => $e->getMessage(),
                ]);
                $fbSize = $this->sizeForModel($fallback, $aspect);
                [$bytes, $cost, $usage] = $this->paidImage($orgId, $fallback, $prompt, $fbSize);
                return [$bytes, $fallback, $cost, $usage];
            }
            throw $e;
        }
    }

    private function paidImage(int $orgId, string $model, string $prompt, string $size): array
    {
        ContentModels::assertImage($model);
        return app(\App\Services\Content\ContentAiGate::class)->attempt($orgId, function () use ($orgId, $model, $prompt, $size) {
            return $this->requestImage($model, $prompt, $size, $orgId);
        });
    }

    /**
     * One high-quality PNG. Current GPT Image models return base64 without response_format.
     */
    private function requestImage(string $model, string $prompt, string $size, int $orgId): array
    {
        $params = [
            'model' => $model,
            'prompt' => $prompt,
            'n' => 1,
            'size' => $size,
            'quality' => 'high',
            'output_format' => 'png',
        ];

        $response = $this->client()->images()->create($params);
        $usage = $response->usage?->toArray();
        $ledger = app(AiUsageService::class);
        $cost = $ledger->imageCost($model, $size, $usage, $prompt);
        $ledger->recordImage($orgId, $model, $size, AiClient::USAGE_FEATURE, $usage, $prompt);
        $first = $response->data[0] ?? null;

        if ($first && !empty($first->b64_json)) {
            $decoded = base64_decode($first->b64_json, true);
            if ($decoded === false) {
                throw new \RuntimeException('OpenAI returned an image that could not be decoded.');
            }
            return [$decoded, $cost, $usage];
        }

        if ($first && !empty($first->url)) {
            $timeout = \App\Services\Content\ContentExecution::budget()->requestTimeout();
            return [(string) (new GuzzleClient(['timeout'=>$timeout,'connect_timeout'=>min(5,$timeout)]))->get($first->url)->getBody(), $cost, $usage];
        }

        throw new \RuntimeException('OpenAI returned no image data.');
    }

    /**
     * Compose the final image prompt from the brief + brand visual style.
     */
    private function buildImagePrompt(ContentPlannerPost $post, ContentPlannerVisualBrief $brief, $profile, ?string $instructions = null): string
    {
        $parts = [];

        $base = trim((string) ($brief->image_prompt_future ?: $brief->scene ?: $brief->description ?: $post->topic));
        $parts[] = $base !== '' ? $base : 'A clean, professional brand image.';

        if ($brief->mood) {
            $parts[] = 'Mood: ' . $brief->mood . '.';
        }
        if ($brief->composition) {
            $parts[] = 'Composition: ' . $brief->composition . '.';
        }

        $style = is_array($profile->visual_style) ? $profile->visual_style : [];
        if (!empty($style['style'])) {
            $parts[] = 'Overall style: ' . $style['style'] . '.';
        }
        if (!empty($style['colors']) && is_array($style['colors'])) {
            $parts[] = 'Brand colors: ' . implode(', ', array_slice($style['colors'], 0, 5)) . '.';
        }

        $avoid = [];
        if ($brief->avoid) {
            $avoid[] = $brief->avoid;
        }
        if (!empty($style['avoid']) && is_array($style['avoid'])) {
            $avoid = array_merge($avoid, $style['avoid']);
        }
        $avoid[] = 'no watermarks';
        $avoid[] = 'no real brand logos';
        $avoid[] = 'no gibberish text';
        $parts[] = 'Avoid: ' . implode(', ', array_unique($avoid)) . '.';

        // Only ask for text in-image when the brief explicitly wants an overlay.
        if (!$brief->text_overlay) {
            $parts[] = 'Do not render any words or text in the image.';
        }

        $extra = trim((string) $instructions);
        if ($extra !== '') {
            $parts[] = 'Additional direction from the user (prioritize this): ' . mb_substr($extra, 0, 800);
        }

        return mb_substr(implode(' ', $parts), 0, 3800);
    }

    /**
     * Map aspect ratio → a size valid for the given model.
     */
    private function sizeForModel(string $model, ?string $aspect): string
    {
        $orientation = $this->orientation($aspect);

        return match ($orientation) {
            'portrait' => '1024x1536',
            'landscape' => '1536x1024',
            default => '1024x1024',
        };
    }

    private function orientation(?string $aspect): string
    {
        $a = strtolower(trim((string) $aspect));
        if (in_array($a, ['9:16', '4:5', '2:3', '3:4', 'portrait', 'vertical'], true)) {
            return 'portrait';
        }
        if (in_array($a, ['16:9', '1.91:1', '3:2', '4:3', 'landscape', 'horizontal'], true)) {
            return 'landscape';
        }
        return 'square';
    }

    private function isAccessError(string $message): bool
    {
        $m = strtolower($message);
        foreach (['organization must be verified', 'organisation must be verified', 'verify your organization',
            'verify your organisation', 'does not have access to model', 'do not have access to model',
            'does not have access for this project', 'model_not_found'] as $needle) {
            if (str_contains($m, $needle)) {
                return true;
            }
        }
        return false;
    }

    private function isModelAccessError(\OpenAI\Exceptions\ErrorException $error): bool
    {
        // A specific provider code wins over incidental words in its message.
        $code = $error->getErrorCode();
        if ($code !== null && ! in_array($code, ['model_not_found', 'model_access_denied', 'organization_verification_required'], true)) {
            return false;
        }
        return $code !== null || $this->isAccessError($error->getMessage());
    }

    private function friendlyError(string $message): string
    {
        if ($this->isAccessError($message)) {
            return 'Image generation failed: the image model may require a verified organisation.';
        }
        if (str_contains(strtolower($message), 'billing') || str_contains(strtolower($message), 'quota')) {
            return 'Image generation failed: the provider reported a billing or quota issue.';
        }
        return 'Image generation failed. Please try again.';
    }

    /**
     * A dedicated client bounded by this execution's remaining deadline: 45 s total
     * on legacy web requests, up to 90 s per attempt within queued work's 100 s.
     */
    private function client(): ClientContract
    {
        if ($this->client === null) {
            $timeout = min((int) config('openai.image_timeout', 120), \App\Services\Content\ContentExecution::budget()->requestTimeout());
            $http = $this->http ?? new GuzzleClient([
                'timeout' => $timeout,
                'connect_timeout' => min(5, $timeout),
            ]);
            $factory = \OpenAI::factory()
                ->withApiKey((string) config('openai.api_key'))
                ->withHttpClient(new ImageUsageTransport($http));
            if ($org = config('openai.organization')) {
                $factory = $factory->withOrganization((string) $org);
            }
            // Rebuild for each attempt: fallback gets only the time still remaining.
            return $factory->make();
        }

        return $this->client;
    }

    private function model(): string
    {
        return ContentModels::image((string) config('openai.image_model', ContentModels::IMAGE_DEFAULT));
    }

    private function apiKey(): ?string
    {
        $key = config('openai.api_key');
        return $key ? (string) $key : null;
    }

    private function logGeneration(ContentPlannerPost $post, ?string $model, string $status, ?string $error, ?array $cost = null, ?array $usage = null): void
    {
        try {
            ContentPlannerAiGeneration::create([
                'organization_id' => $post->organization_id,
                'brand_id' => $post->brand_id,
                'planner_profile_id' => $post->planner_profile_id,
                'user_id' => auth()->id(),
                'generation_type' => 'image',
                'model' => $model ?? $this->model(),
                'status' => $status,
                'error_message' => $error ? mb_substr($error, 0, 2000) : null,
                'tokens_input' => $cost['input_tokens'] ?? null,
                'tokens_output' => $cost['output_tokens'] ?? null,
                'response_json' => $cost === null ? null : ['usage' => $usage, 'accounted_usage' => $cost],
                'cost_estimate' => $cost['cost_usd'] ?? null,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Image generation log failed: ' . $e->getMessage());
        }
    }
}
