<?php

namespace App\Services\Portal;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Support\Accent;

/**
 * The venue's colour and face for the member portal, computed once, server
 * side, with the contrast check the landing kits already trust.
 *
 * The SPA's own ramp (useTheme.ts) lightens and darkens without measuring
 * anything; App\Support\Accent measures. So the portal asks Accent twice —
 * once against the light paper, once against the dark one — and ships six
 * values the client writes into CSS variables verbatim.
 */
final class PortalTheme
{
    public const LIGHT_SURFACE = '#F7F6F3';
    public const DARK_SURFACE  = '#0F1113';

    /** Display face per industry; the body face is always Inter. */
    public const DISPLAY_FACES = [
        'hotel'      => 'playfair',
        'beauty'     => 'cormorant',
        'medical'    => 'fraunces',
        'restaurant' => 'newsreader',
        'fitness'    => 'space',
    ];
    public const DEFAULT_FACE = 'manrope';

    /** Accent when the venue has not chosen a colour. */
    public const ACCENT_DEFAULTS = [
        'hotel'      => '#B8924A',
        'beauty'     => '#B04A6E',
        'medical'    => '#1F7A73',
        'restaurant' => '#B5552F',
        'fitness'    => '#2E7D5B',
    ];
    public const ACCENT_FALLBACK = '#2F5D8A';

    public static function for(Organization $org): array
    {
        $industry = $org->resolved_industry ?? Organization::DEFAULT_INDUSTRY;
        $default  = self::ACCENT_DEFAULTS[$industry] ?? self::ACCENT_FALLBACK;

        // The appearance setting the admin theme editor writes. Read outside
        // the cached map on purpose: this runs for public join requests where
        // no tenant is bound and HotelSetting::getValue() would look at the
        // wrong organisation.
        $hex = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('key', 'primary_color')
            ->value('value');
        $hex = is_string($hex) && $hex !== '' ? $hex : null;

        $light = Accent::for($hex, $default, self::LIGHT_SURFACE);
        $dark  = Accent::for($hex, $default, self::DARK_SURFACE);

        $logo = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->whereIn('key', ['logo_url', 'company_logo'])
            ->orderByRaw("CASE key WHEN 'logo_url' THEN 0 ELSE 1 END")
            ->value('value');

        return [
            'accent' => [
                'hex'       => $light->brand,
                'ink'       => $light->on,
                'deep'      => $light->deep,
                'dark_hex'  => $dark->brand,
                'dark_ink'  => $dark->on,
                'dark_deep' => $dark->deep,
            ],
            'display_face' => self::DISPLAY_FACES[$industry] ?? self::DEFAULT_FACE,
            'industry'     => $industry,
            'logo_url'     => (is_string($logo) && $logo !== '') ? $logo : ($org->logo_url ?: null),
        ];
    }
}
