<?php

namespace App\Services\Content;

/**
 * Suggested posting times per platform, with industry overrides (spec 2026-10-15 §5): research-based starting points,
 * not learned from the venue. The same table as frontend/src/content/lib/bestTimes.json (BestTimesTest keeps them equal).
 */
final class BestTimes
{
    public const TABLE = [
        'default' => [
            'instagram' => ['11:00', '19:00'],
            'facebook'  => ['09:00', '13:00'],
            'linkedin'  => ['08:00', '12:00'],
            'tiktok'    => ['18:00', '21:00'],
            'x'         => ['09:00', '12:00'],
            'youtube'   => ['15:00', '18:00'],
            'blog'      => ['10:00'],
            'email'     => ['10:00'],
        ],
        'industries' => [
            'beauty'     => ['facebook' => ['10:00', '19:00']],
            'fitness'    => ['instagram' => ['06:30', '18:00'], 'facebook' => ['06:30', '18:00']],
            'restaurant' => ['instagram' => ['11:00', '17:00'], 'facebook' => ['11:00', '17:00']],
            'hotel'      => ['instagram' => ['10:00', '20:00'], 'facebook' => ['10:00', '20:00']],
            'medical'    => ['instagram' => ['12:00', '19:00'], 'facebook' => ['09:00', '12:00']],
        ],
    ];

    /** @return list<string> */
    public static function suggested(string $platform, ?string $industry): array
    {
        return self::TABLE['industries'][$industry ?? ''][$platform] ?? self::TABLE['default'][$platform] ?? [];
    }

    /** A channel's usual time: its own, else the first suggested time for its platform. */
    public static function usual(?string $postTime, string $platform, ?string $industry): ?string
    {
        return $postTime ?: (self::suggested($platform, $industry)[0] ?? null);
    }
}
