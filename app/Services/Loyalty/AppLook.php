<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\User;
use App\Rules\MaxImageDimensions;
use App\Services\Loyalty\App\OwnMedia;
use App\Services\MediaService;
use App\Support\SettingRegistry;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * The member app's look (release 2 §7): the native apps' colours and styles in `hotel_settings` group `mobile_app`,
 * which they read through the public `GET /v1/theme` (`mobile_theme`), and the venue's logo (`company_logo`, which
 * that answer's `theme`, the portal and the wallet pass read). HexaTech Loyalty writes the same keys in the same
 * format as the full admin's Settings page (Member App tab, SettingsController::update and ::uploadLogo), so the
 * apps see the same answer whichever side saved: values are strings, colours `#rrggbb` in lower case as the colour
 * picker gives them, the radius a whole number of pixels, a new row made as that controller makes one.
 *
 * The lists below are the full admin's own (pages/Settings.tsx renderMobileApp: the twelve presets, the card styles,
 * the radius slider's 0–32, the button styles, the accent intensities, the Gold Classic fallbacks); the workspace
 * reads them from here, never from a copy. Unlike the full admin, a colour that is not `#rrggbb` and a style not in
 * its list are refused, per field.
 */
final class AppLook
{
    /** The colour keys (`mobile_{key}_color`), in the seed's order. */
    public const COLORS = ['primary', 'background', 'surface', 'secondary', 'text', 'text_secondary', 'border', 'success', 'error', 'warning', 'info'];
    public const CARD_STYLES = ['gradient', 'solid', 'glass'];
    public const BUTTON_STYLES = ['filled', 'outline', 'soft'];
    public const ACCENT_INTENSITIES = ['subtle', 'vibrant', 'bold'];
    public const RADIUS_MIN = 0;
    public const RADIUS_MAX = 32;

    /** Neutral palettes only: they write existing colour keys, never an unsupported native theme mode. */
    public const COLOR_MODES = [
        'dark' => ['background' => '#242c3b', 'surface' => '#353f54', 'secondary' => '#222834', 'text' => '#f5f7fb', 'text_secondary' => '#a6b5cd', 'border' => '#353f54'],
        'light' => ['background' => '#f5f7fb', 'surface' => '#ffffff', 'secondary' => '#e8edf5', 'text' => '#242c3b', 'text_secondary' => '#53627a', 'border' => '#c7d3e5'],
    ];

    /** The logo's limits: SettingsController::uploadLogo's, with the dimension rule the other pictures use. */
    public const LOGO_MAX_KB = 4096;
    public const LOGO_MAX_EDGE = 4096;

    public const COLOR_RULE = '/^#[0-9a-fA-F]{6}$/';

    /** The presets by key; `name` is what `mobile_preset_name` stores, so the full admin shows the same one chosen. */
    public const PRESETS = [
        'gold_classic'    => ['name' => 'Gold Classic', 'colors' => ['#c9a84c', '#0d0d0d', '#161616', '#1e1e1e', '#ffffff', '#8e8e93', '#2c2c2c', '#32d74b', '#ff375f', '#ffd60a', '#0a84ff']],
        'royal_sapphire'  => ['name' => 'Royal Sapphire', 'colors' => ['#3b82f6', '#0a0f1e', '#111827', '#1f2937', '#f8fafc', '#94a3b8', '#1f2a3a', '#22c55e', '#ef4444', '#eab308', '#06b6d4']],
        'emerald_spa'     => ['name' => 'Emerald Spa', 'colors' => ['#10b981', '#06120c', '#0f1f17', '#162a1f', '#f0fdf4', '#86efac', '#1e3a2f', '#22c55e', '#f43f5e', '#fbbf24', '#38bdf8']],
        'rose_boutique'   => ['name' => 'Rose Boutique', 'colors' => ['#e11d48', '#0f0708', '#1c1017', '#2a1620', '#fff1f2', '#fda4af', '#3b1524', '#10b981', '#dc2626', '#facc15', '#60a5fa']],
        'ocean_resort'    => ['name' => 'Ocean Resort', 'colors' => ['#06b6d4', '#04141c', '#0f2937', '#163847', '#ecfeff', '#67e8f9', '#164e63', '#22c55e', '#fb7185', '#fde047', '#818cf8']],
        'champagne_lux'   => ['name' => 'Champagne Lux', 'colors' => ['#d4af37', '#100e0a', '#1c1814', '#2a2418', '#fdf6e3', '#c4a476', '#2e2820', '#22c55e', '#e25555', '#f5b400', '#5ec4e8']],
        'midnight_violet' => ['name' => 'Midnight Violet', 'colors' => ['#8b5cf6', '#0c0a14', '#15112a', '#1e1836', '#f5f3ff', '#a78bfa', '#2e2654', '#34d399', '#f87171', '#fbbf24', '#38bdf8']],
        'tropical_sunset' => ['name' => 'Tropical Sunset', 'colors' => ['#f97316', '#120a06', '#1e1410', '#2a1e18', '#fff7ed', '#fdba74', '#3d2a1e', '#4ade80', '#ef4444', '#fde047', '#67e8f9']],
        'alpine_lodge'    => ['name' => 'Alpine Lodge', 'colors' => ['#78716c', '#0e0d0b', '#1c1a17', '#292521', '#fafaf9', '#a8a29e', '#33302c', '#86efac', '#fca5a5', '#fcd34d', '#93c5fd']],
        'urban_loft'      => ['name' => 'Urban Loft', 'colors' => ['#f5f5f5', '#09090b', '#141416', '#1e1e22', '#fafafa', '#71717a', '#27272a', '#22c55e', '#ef4444', '#eab308', '#3b82f6']],
        'desert_oasis'    => ['name' => 'Desert Oasis', 'colors' => ['#c2410c', '#0f0a07', '#1a140e', '#261e16', '#fef3c7', '#d6a56a', '#3b2e20', '#4ade80', '#fb923c', '#fde68a', '#7dd3fc']],
        'nordic_ice'      => ['name' => 'Nordic Ice', 'colors' => ['#0ea5e9', '#070c10', '#0e1620', '#162032', '#f0f9ff', '#7dd3fc', '#1e3048', '#34d399', '#fb7185', '#fde047', '#a78bfa']],
    ];

    /** The full admin's fallbacks for a key never saved: Gold Classic, a gradient card, 16 px, filled, vibrant. */
    public const DEFAULTS = ['card_style' => 'gradient', 'radius' => 16, 'button_style' => 'filled', 'accent_intensity' => 'vibrant'];

    public const LOGO_KEY = 'company_logo';
    public const PRESET_KEY = 'mobile_preset_name';

    /** @return array<string, string> a preset's colours by key */
    public static function presetColors(string $preset): array
    {
        return array_combine(self::COLORS, self::PRESETS[$preset]['colors']);
    }

    /**
     * The look as the apps get it, with the full admin's fallback for each key never saved (or saved empty). Values
     * are answered as stored — a colour the full admin let through in another shape is the workspace's to flag. The
     * preset is its key, from the stored name; null for none or a name not in the list.
     *
     * @return array{colors: array<string, string>, card_style: string, radius: int, button_style: string,
     *   accent_intensity: string, preset: ?string, logo_url: ?string}
     */
    public static function read(): array
    {
        $stored = HotelSetting::query()->whereIn('key', [...self::settingKeys(), self::PRESET_KEY, self::LOGO_KEY])
            ->pluck('value', 'key')->map(fn ($v) => is_string($v) ? $v : null)->all();
        $value = fn (string $key, string $default): string => ($stored[$key] ?? '') !== '' ? (string) $stored[$key] : $default;

        $defaults = self::presetColors('gold_classic');
        $colors = [];
        foreach (self::COLORS as $name) {
            $colors[$name] = $value("mobile_{$name}_color", $defaults[$name]);
        }
        $radius = preg_match('/^\s*(\d+)/', (string) ($stored['mobile_radius'] ?? ''), $m) ? (int) $m[1] : self::DEFAULTS['radius'];
        $presetName = $stored[self::PRESET_KEY] ?? null;
        $preset = null;
        foreach (self::PRESETS as $key => $p) {
            if ($p['name'] === $presetName) {
                $preset = $key;
            }
        }

        return [
            'colors'           => $colors,
            'card_style'       => $value('mobile_card_style', self::DEFAULTS['card_style']),
            'radius'           => $radius,
            'button_style'     => $value('mobile_button_style', self::DEFAULTS['button_style']),
            'accent_intensity' => $value('mobile_accent_intensity', self::DEFAULTS['accent_intensity']),
            'preset'           => $preset,
            'logo_url'         => ($stored[self::LOGO_KEY] ?? '') !== '' ? $stored[self::LOGO_KEY] : null,
        ];
    }

    /** @return array<string, mixed> The lists the form chooses from, and the logo's limits. */
    public static function options(): array
    {
        return [
            'colors'             => self::COLORS,
            'card_styles'        => self::CARD_STYLES,
            'button_styles'      => self::BUTTON_STYLES,
            'accent_intensities' => self::ACCENT_INTENSITIES,
            'radius'             => ['min' => self::RADIUS_MIN, 'max' => self::RADIUS_MAX],
            'presets'            => array_map(
                fn (string $key) => ['key' => $key, 'name' => self::PRESETS[$key]['name'], 'colors' => self::presetColors($key)],
                array_keys(self::PRESETS),
            ),
            'logo'               => ['max_kb' => self::LOGO_MAX_KB, 'max_edge' => self::LOGO_MAX_EDGE, 'types' => ['image/jpeg', 'image/png', 'image/webp']],
            'color_modes'        => self::COLOR_MODES,
        ];
    }

    /**
     * The whole look's rules (colours, styles, radius; a preset is optional — sent, it names the one applied last, as
     * the full admin keeps it; not sent, the stored one stays).
     *
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        $rules = [
            'colors'           => ['required', 'array'],
            'card_style'       => ['required', 'string', 'in:' . implode(',', self::CARD_STYLES)],
            'radius'           => ['required', 'integer', 'min:' . self::RADIUS_MIN, 'max:' . self::RADIUS_MAX],
            'button_style'     => ['required', 'string', 'in:' . implode(',', self::BUTTON_STYLES)],
            'accent_intensity' => ['required', 'string', 'in:' . implode(',', self::ACCENT_INTENSITIES)],
            'preset'           => ['sometimes', 'nullable', 'string', 'in:' . implode(',', array_keys(self::PRESETS))],
        ];
        foreach (self::COLORS as $name) {
            $rules["colors.{$name}"] = ['required', 'string', 'regex:' . self::COLOR_RULE];
        }

        return $rules;
    }

    /**
     * Save a validated look: each key whose value changes is written (a row this organisation lacks is made as the
     * full admin makes it), in one transaction, and one audit row names what changed. Answers the look as read again.
     *
     * @param array<string, mixed> $data validated by rules()
     * @return array<string, mixed>
     */
    public static function save(array $data, User $by): array
    {
        $values = [];
        foreach (self::COLORS as $name) {
            $values["mobile_{$name}_color"] = strtolower((string) $data['colors'][$name]);
        }
        $values['mobile_card_style'] = (string) $data['card_style'];
        $values['mobile_radius'] = (string) (int) $data['radius'];
        $values['mobile_button_style'] = (string) $data['button_style'];
        $values['mobile_accent_intensity'] = (string) $data['accent_intensity'];
        if (!empty($data['preset'])) {
            $values[self::PRESET_KEY] = self::PRESETS[$data['preset']]['name'];
        }

        [$new, $old] = DB::transaction(function () use ($values) {
            $new = [];
            $old = [];
            foreach ($values as $key => $value) {
                $row = HotelSetting::query()->where('key', $key)->first();
                if ($row && $row->value === $value) {
                    continue;
                }
                $old[$key] = $row?->value;
                $new[$key] = $value;
                $row ? $row->update(['value' => $value]) : self::create($key, $value);
            }

            return [$new, $old];
        });

        if ($new !== []) {
            AuditLog::record('mobile_app_look_updated', null, $new, $old, $by, 'Member app look updated');
        }

        return self::read();
    }

    /** @return array<string, mixed> */
    public static function logoRules(): array
    {
        return ['logo' => ['required', 'image', 'mimes:jpeg,png,jpg,webp', 'max:' . self::LOGO_MAX_KB, new MaxImageDimensions(self::LOGO_MAX_EDGE)]];
    }

    /**
     * The venue's logo, the one writer of it (the workspace's upload and the full admin's SettingsController::uploadLogo
     * both call it): MediaService's `logos` folder, the setting `company_logo` (made in `appearance` when missing), the
     * old file deleted once the setting no longer names it — only when it is this organisation's own file in that
     * folder. Answers the new address.
     */
    public static function setLogo(UploadedFile $file, User $by): string
    {
        $orgId = (int) app('current_organization_id');
        $url = MediaService::upload($file, 'logos');

        try {
            $old = DB::transaction(function () use ($url, $orgId) {
                $row = HotelSetting::query()->where('key', self::LOGO_KEY)->lockForUpdate()->first();
                $old = $row?->value;
                if ($row) {
                    $row->update(['value' => $url]);
                } else {
                    HotelSetting::create([
                        'key'             => self::LOGO_KEY,
                        'value'           => $url,
                        'type'            => 'string',
                        'group'           => 'appearance',
                        'label'           => 'Company Logo',
                        'description'     => 'Logo displayed in the app header and member cards',
                        'organization_id' => $orgId,
                    ]);
                }

                return $old;
            });
        } catch (\Throwable $e) {
            try {
                MediaService::delete($url);
            } catch (\Throwable) {
            }
            throw $e;
        }

        if (is_string($old) && $old !== $url) {
            OwnMedia::forget($old, $orgId, 'logos');
        }

        AuditLog::record('logo_uploaded', HotelSetting::query()->where('key', self::LOGO_KEY)->first(), ['logo' => $old ? 'replaced' : 'added'], [], $by,
            'Company logo updated');

        return $url;
    }

    /** @return list<string> the style and colour keys, without the preset */
    private static function settingKeys(): array
    {
        return [
            ...array_map(fn (string $name) => "mobile_{$name}_color", self::COLORS),
            'mobile_card_style', 'mobile_radius', 'mobile_button_style', 'mobile_accent_intensity',
        ];
    }

    /** A missing row uses the same canonical metadata as SettingsController, independent of other tenants. */
    private static function create(string $key, string $value): void
    {
        $definition = SettingRegistry::get($key) ?? throw new \LogicException('Unknown app-look setting');
        HotelSetting::create([
            'key'             => $key,
            'value'           => $value,
            'type'            => $definition['type'],
            'group'           => $definition['group'],
            'label'           => $definition['label'],
            'scope'           => $definition['scope'],
            'organization_id' => (int) app('current_organization_id'),
        ]);
    }
}
