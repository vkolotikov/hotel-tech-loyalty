<?php

namespace App\Services\ContentPlanner;

use App\Models\ContentPlannerAiGeneration;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use App\Services\ContentVisualBriefService;
use App\Services\MediaService;
use GuzzleHttp\Client as GuzzleClient;
use Illuminate\Support\Facades\Log;
use OpenAI\Contracts\ClientContract;

/**
 * Generates an actual image per post using OpenAI (gpt-image-1, with an
 * automatic fall back to dall-e-3 on an access/verification error). The
 * prompt comes from the post's visual brief (image_prompt_future) plus the
 * brand's visual style; the resulting image is stored via MediaService and
 * its URL saved on the visual brief.
 */
class ImageGenerationService
{
    public function __construct(
        protected ContentVisualBriefService $visualBriefService,
    ) {
    }

    /**
     * Generate (or regenerate) the image for a post.
     * Ensures a visual brief exists first (generating one if needed).
     */
    public function generateForPost(ContentPlannerPost $post, ?string $instructions = null): ContentPlannerVisualBrief
    {
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
            [$bytes, $modelUsed] = $this->createImage($this->model(), $prompt, $size, $brief->aspect_ratio);
        } catch (\Throwable $e) {
            $brief->update([
                'image_status' => 'failed',
                'image_error' => mb_substr($e->getMessage(), 0, 1000),
            ]);
            $this->logGeneration($post, null, 'error', $e->getMessage());
            throw new \RuntimeException($this->friendlyError($e->getMessage()));
        }

        $url = MediaService::putRaw($bytes, 'content-planner/images', 'png');

        $brief->update([
            'image_url' => $url,
            'image_status' => 'ready',
            'image_model' => $modelUsed,
            'image_error' => null,
            'image_generated_at' => now(),
        ]);

        // A post with a fresh visual is no longer "needs_visual".
        if ($post->status === 'needs_visual') {
            $post->update(['status' => 'needs_review']);
        }

        $this->logGeneration($post, $modelUsed, 'success', null);

        return $brief->fresh();
    }

    /**
     * Call OpenAI images, trying the primary model then the fallback on an
     * access/verification error. Returns [rawBytes, modelUsed].
     */
    private function createImage(string $model, string $prompt, string $size, ?string $aspect): array
    {
        try {
            return [$this->requestImage($model, $prompt, $size), $model];
        } catch (\Throwable $e) {
            $fallback = config('openai.image_fallback_model', 'dall-e-3');
            if ($fallback && $fallback !== $model && $this->isAccessError($e->getMessage())) {
                Log::warning("Content Planner image: {$model} unavailable, falling back to {$fallback}", [
                    'error' => $e->getMessage(),
                ]);
                $fbSize = $this->sizeForModel($fallback, $aspect);
                return [$this->requestImage($fallback, $prompt, $fbSize), $fallback];
            }
            throw $e;
        }
    }

    /**
     * Single OpenAI image request. gpt-image-1 always returns b64_json and
     * rejects response_format; dall-e-* accepts response_format=b64_json.
     */
    private function requestImage(string $model, string $prompt, string $size): string
    {
        $params = [
            'model' => $model,
            'prompt' => $prompt,
            'n' => 1,
            'size' => $size,
        ];

        if (str_starts_with($model, 'dall-e')) {
            $params['response_format'] = 'b64_json';
            $params['quality'] = 'hd';
        } else {
            // gpt-image-1
            $params['quality'] = 'high';
        }

        $response = $this->client()->images()->create($params);
        $first = $response->data[0] ?? null;

        if ($first && !empty($first->b64_json)) {
            $decoded = base64_decode($first->b64_json, true);
            if ($decoded === false) {
                throw new \RuntimeException('OpenAI returned an image that could not be decoded.');
            }
            return $decoded;
        }

        if ($first && !empty($first->url)) {
            $bytes = @file_get_contents($first->url);
            if ($bytes === false) {
                throw new \RuntimeException('Could not download the generated image from OpenAI.');
            }
            return $bytes;
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

        if (str_starts_with($model, 'dall-e')) {
            return match ($orientation) {
                'portrait' => '1024x1792',
                'landscape' => '1792x1024',
                default => '1024x1024',
            };
        }

        // gpt-image-1
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
        foreach (['verif', 'must be verified', 'not have access', 'does not have access', 'unsupported', 'gpt-image', 'model_not_found', 'not allowed', 'permission'] as $needle) {
            if (str_contains($m, $needle)) {
                return true;
            }
        }
        return false;
    }

    private function friendlyError(string $message): string
    {
        if ($this->isAccessError($message)) {
            return 'Image generation failed: your OpenAI account may not have access to the image model. Try setting CONTENT_PLANNER_IMAGE_MODEL=dall-e-3. (' . mb_substr($message, 0, 160) . ')';
        }
        if (str_contains(strtolower($message), 'billing') || str_contains(strtolower($message), 'quota')) {
            return 'Image generation failed: OpenAI billing/quota issue. Check your OpenAI account. (' . mb_substr($message, 0, 160) . ')';
        }
        return 'Image generation failed: ' . mb_substr($message, 0, 220);
    }

    /**
     * A dedicated OpenAI client with a long timeout — image generation far
     * exceeds the app-wide 30s default used by the facade.
     */
    private ?ClientContract $client = null;

    private function client(): ClientContract
    {
        if ($this->client === null) {
            $timeout = (int) config('openai.image_timeout', 120);
            $http = new GuzzleClient([
                'timeout' => $timeout,
                'connect_timeout' => 15,
            ]);
            $factory = \OpenAI::factory()
                ->withApiKey((string) config('openai.api_key'))
                ->withHttpClient($http);
            if ($org = config('openai.organization')) {
                $factory = $factory->withOrganization((string) $org);
            }
            $this->client = $factory->make();
        }

        return $this->client;
    }

    private function model(): string
    {
        return (string) config('openai.image_model', 'gpt-image-1');
    }

    private function apiKey(): ?string
    {
        $key = config('openai.api_key');
        return $key ? (string) $key : null;
    }

    private function logGeneration(ContentPlannerPost $post, ?string $model, string $status, ?string $error): void
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
                // Flat per-image cost estimate (high quality ≈ $0.04-0.19).
                'cost_estimate' => $status === 'success' ? 0.08 : null,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Image generation log failed: ' . $e->getMessage());
        }
    }
}
