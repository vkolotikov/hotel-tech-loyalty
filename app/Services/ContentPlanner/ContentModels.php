<?php

namespace App\Services\ContentPlanner;

use App\Services\AiUsageService;
use App\Services\Content\ContentRefused;

/** Provider selection is local: old configuration must never reach a retired endpoint. */
final class ContentModels
{
    public const IMAGE_DEFAULT = 'gpt-image-2.6-sunburst';

    public const IMAGE_ALTERNATIVE = 'gpt-image-2.6-flare';

    private const LEGACY_IMAGES = ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-1.5-2025-12-16',
        'chatgpt-image-latest', 'dall-e-2', 'dall-e-3', 'gpt-image-1-mini'];

    public static function image(string $model, bool $fallback = false): string
    {
        $model = trim($model);
        if (in_array($model, self::LEGACY_IMAGES, true)) {
            return $fallback || $model === 'gpt-image-1-mini' ? self::IMAGE_ALTERNATIVE : self::IMAGE_DEFAULT;
        }

        return $model;
    }

    public static function assertImage(string $model): void
    {
        if (! isset(AiUsageService::IMAGE_TOKEN_PRICING[$model])) {
            self::unpriced();
        }
    }

    public static function assertText(string $model): void
    {
        $prices = AiUsageService::MODEL_PRICING[$model] ?? [];
        if (! str_starts_with($model, 'claude-') || ! isset($prices['input'], $prices['output'])) {
            self::unpriced();
        }
    }

    public static function unpriced(): never
    {
        throw new ContentRefused('ai_model_unpriced', 'The configured AI model is unavailable. Ask an administrator to check the AI settings.', 502);
    }
}
