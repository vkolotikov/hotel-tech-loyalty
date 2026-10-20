<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;

/**
 * The language of Content's pages on the public host (spec 2026-10-19 §5.3, §6.2): the brand's Content language when it
 * is one of the five, otherwise English. Read across tenants (a public request has none).
 */
final class ContentPublicLanguage
{
    public const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    public static function of(?int $brandId): string
    {
        $language = $brandId === null ? null
            : ContentPlannerProfile::withoutGlobalScopes()->where('brand_id', $brandId)->value('default_language');
        $language = strtolower(substr((string) $language, 0, 2));

        return in_array($language, self::LANGUAGES, true) ? $language : 'en';
    }
}
