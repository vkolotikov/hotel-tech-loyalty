<?php

namespace App\Services\Dashboard;

use App\Models\Organization;
use App\Models\Property;
use App\Services\Portal\AppointmentClock;
use App\Services\Portal\PortalBootstrap;
use App\Support\SharedCache;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The venue's "now" for every dashboard (owner 2026-11-09: "maybe weather info, time"): the venue's zone and clock, the
 * place the venue is in, and that place's weather — reads only, the same answer for the full admin and each workspace.
 *
 * - The zone is the venue's own (`AppointmentClock::zoneFor()`, i.e. `PortalBootstrap::timezone()`), never the
 *   browser's: a manager abroad still sees the venue's day. The currency is the venue's too
 *   (`PortalBootstrap::currency()`, as the workspaces read it), so a dashboard's money reads in it.
 * - The place is the first location (`properties`) with a city — active ones first, then the oldest; otherwise the
 *   city a named zone carries (`Europe/Riga` → Riga). Nothing else is guessed: UTC names no place, so no weather.
 *   A location's country is free text: a code (`LV`), or a name in English, German, French, Spanish, Russian, Latvian…
 *   (`Latvia`, `Lettland`, `Латвия`) reads as its code; the organisation's own country is never put in its place
 *   (a venue abroad is still found). The Locations form fills both from a city search (`places()`).
 * - When the venue names no zone (UTC), the clock and the forecast follow the place's own zone: the location's when it
 *   names one, else the one the city search found (`timezone_source`).
 * - The weather is Open-Meteo's (no key, no personal data: only the city's name and coordinates leave the server). A city
 *   is looked up with its country, then without it; found places live in SharedCache 30 days, a city the provider does
 *   not know 1 hour, the weather 20 minutes, and an unreachable provider is remembered for 5 minutes, so it costs one
 *   short wait, not one per page. `weather_status` says why there is no weather (`no_place`, `place_not_found`,
 *   `unavailable`, `off`); a dashboard never fails because of the weather.
 */
final class VenuePulse
{
    /** Countries that read temperatures in Fahrenheit and wind in miles an hour. */
    private const IMPERIAL = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'];

    private const PLACE_TTL = 2592000;   // 30 days

    private const WEATHER_TTL = 1200;    // 20 minutes

    private const FAILURE_TTL = 300;     // 5 minutes

    private const MISS_TTL = 3600;       // 1 hour: a city the provider does not know (perhaps a typo, fixed soon)

    /**
     * @return array<string, mixed>
     */
    public function for(Organization $org): array
    {
        $venueZone = AppointmentClock::zoneFor((int) $org->id);
        $place = $this->place($org, $venueZone);

        $status = 'no_place';
        $coords = null;
        if ($place !== null && !config('services.weather.enabled', true)) {
            $status = 'off';
        } elseif ($place !== null) {
            $coords = $this->coordinates($place['name'], $place['country']);
            $status = is_array($coords) ? 'ok' : ($coords === 'not_found' ? 'place_not_found' : 'unavailable');
        }

        // The clock's zone: the venue's; a venue on UTC (no zone named) reads the place's own.
        $zone = $venueZone;
        $zoneSource = 'venue';
        if ($venueZone === 'UTC') {
            if (($place['timezone'] ?? null) !== null) {
                [$zone, $zoneSource] = [$place['timezone'], 'location'];
            } elseif (is_array($coords) && $coords['timezone'] !== null) {
                [$zone, $zoneSource] = [$coords['timezone'], 'place'];
            }
        }
        $now = CarbonImmutable::now($zone);

        $weather = null;
        if (is_array($coords)) {
            $weather = $this->weather($coords, $place['country'], $zone, $now);
            if ($weather === null) {
                $status = 'unavailable';
            }
        }

        return [
            'timezone' => $zone,
            'timezone_source' => $zoneSource,
            'now' => $now->toIso8601String(),
            'today' => $now->format('Y-m-d'),
            // The venue's currency, as the workspaces read it, so a dashboard's money reads in it.
            'currency' => PortalBootstrap::currency($org),
            'place' => $place,
            'weather' => $weather,
            'weather_status' => $weather !== null ? 'ok' : $status,
        ];
    }

    /**
     * @return array{name: string, country: ?string, source: string, timezone: ?string}|null
     */
    public function place(Organization $org, string $zone): ?array
    {
        $property = Property::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->whereNotNull('city')
            ->where('city', '!=', '')
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->first(['id', 'city', 'country', 'timezone']);

        if ($property !== null && trim((string) $property->city) !== '') {
            $own = PortalBootstrap::namedZone($property->timezone);

            return [
                'name' => mb_substr(trim((string) $property->city), 0, 100),
                'country' => self::countryCode($property->country),
                'source' => 'location',
                'timezone' => $own !== null && $own !== 'UTC' ? $own : null,
            ];
        }

        $city = self::cityOfZone($zone);
        if ($city === null) {
            return null;
        }

        return ['name' => $city, 'country' => self::countryCode($org->country ?? null), 'source' => 'timezone', 'timezone' => null];
    }

    /**
     * Cities matching what was typed, for the Locations form (`GET admin/properties/places`): each with its region,
     * country (name and code), coordinates and zone, as Open-Meteo knows them. Empty when nothing matches or the provider
     * cannot be reached (`available` says which).
     *
     * @return array{available: bool, places: list<array{name: string, region: ?string, country: ?string, country_code: ?string, latitude: float, longitude: float, timezone: ?string}>}
     */
    public function places(string $query, string $language = 'en'): array
    {
        $query = trim(mb_substr($query, 0, 80));
        if (mb_strlen($query) < 2 || !config('services.weather.enabled', true)) {
            return ['available' => true, 'places' => []];
        }
        $language = preg_match('/^[a-z]{2}$/', $language) === 1 ? $language : 'en';
        $key = 'pulse:places:v2:' . sha1(mb_strtolower($query) . '|' . $language);

        $found = $this->remember($key, self::MISS_TTL, function () use ($query, $language) {
            $response = Http::acceptJson()->connectTimeout(2)->timeout(4)->get(config('services.weather.geocoding_url'), [
                'name' => $query, 'count' => 8, 'language' => $language, 'format' => 'json',
            ]);
            if (!$response->successful()) {
                return null;
            }
            $rows = $response->json('results');

            return is_array($rows) ? array_values($rows) : [];
        });

        if (!is_array($found)) {
            return ['available' => false, 'places' => []];
        }
        $places = [];
        foreach ($found as $row) {
            if (!is_array($row) || !is_numeric($row['latitude'] ?? null) || !is_numeric($row['longitude'] ?? null) || !is_string($row['name'] ?? null)) {
                continue;
            }
            $zone = PortalBootstrap::namedZone($row['timezone'] ?? null);
            $places[] = [
                'name' => $row['name'],
                'region' => is_string($row['admin1'] ?? null) ? $row['admin1'] : null,
                'country' => is_string($row['country'] ?? null) ? $row['country'] : null,
                'country_code' => self::countryCode($row['country_code'] ?? null),
                'latitude' => round((float) $row['latitude'], 4),
                'longitude' => round((float) $row['longitude'], 4),
                'timezone' => $zone !== null && $zone !== 'UTC' ? $zone : null,
            ];
        }

        return ['available' => true, 'places' => $places];
    }

    /** `Europe/Riga` → `Riga`, `America/Argentina/Buenos_Aires` → `Buenos Aires`; UTC and `Etc/*` name no place. */
    public static function cityOfZone(string $zone): ?string
    {
        if ($zone === '' || $zone === 'UTC' || str_starts_with($zone, 'Etc/') || !str_contains($zone, '/')) {
            return null;
        }
        $parts = explode('/', $zone);
        $city = str_replace('_', ' ', (string) end($parts));

        return $city !== '' ? $city : null;
    }

    /** Names that are not a country's name in any language ICU knows, but mean one. */
    private const COUNTRY_ALIASES = [
        'uk' => 'GB', 'england' => 'GB', 'scotland' => 'GB', 'wales' => 'GB', 'northern ireland' => 'GB', 'great britain' => 'GB',
        'britain' => 'GB', 'usa' => 'US', 'united states of america' => 'US', 'america' => 'US', 'uae' => 'AE', 'holland' => 'NL',
    ];

    /** The languages whose country names a location may be written in. */
    private const NAME_LANGUAGES = ['en', 'de', 'fr', 'es', 'ru', 'lv', 'lt', 'et', 'it', 'pt', 'nl', 'pl', 'uk', 'fi', 'sv', 'no', 'da', 'cs'];

    /**
     * A location's country as a two-letter code, or null: a code (`lv`, `UK` reads as GB) or a country's name in one of
     * NAME_LANGUAGES (`Latvia`, `Lettland`, `Латвия`, `Latvija`), case, accents and full stops ignored.
     */
    public static function countryCode(mixed $raw): ?string
    {
        $value = trim((string) $raw);
        if ($value === '') {
            return null;
        }
        if (preg_match('/^[A-Za-z]{2}$/', $value) === 1) {
            $code = strtoupper($value);

            return $code === 'UK' ? 'GB' : $code;
        }

        return self::countryNames()[self::fold($value)] ?? null;
    }

    /** @var array<string, string>|null folded name => code */
    private static ?array $countryNames = null;

    /** @return array<string, string> */
    private static function countryNames(): array
    {
        if (self::$countryNames !== null) {
            return self::$countryNames;
        }
        $map = [];
        foreach (self::COUNTRY_ALIASES as $alias => $code) {
            $map[$alias] = $code;
        }
        $codes = [];
        $bundle = class_exists(\ResourceBundle::class) ? \ResourceBundle::create('en', 'ICUDATA-region') : null;
        $countries = $bundle?->get('Countries');
        if ($countries instanceof \ResourceBundle) {
            foreach ($countries as $code => $unused) {
                if (is_string($code) && preg_match('/^[A-Z]{2}$/', $code) === 1 && $code !== 'ZZ') {
                    $codes[] = $code;
                }
            }
        }
        foreach (self::NAME_LANGUAGES as $language) {
            foreach ($codes as $code) {
                $name = \Locale::getDisplayRegion('-' . $code, $language);
                if (is_string($name) && $name !== '' && $name !== $code) {
                    $map[self::fold($name)] ??= $code;
                }
            }
        }

        return self::$countryNames = $map;
    }

    /** Lower case without accents, full stops or doubled spaces: "Côte d’Ivoire" → "cote d’ivoire". */
    private static function fold(string $text): string
    {
        $text = mb_strtolower(trim($text));
        if (class_exists(\Normalizer::class)) {
            $decomposed = \Normalizer::normalize($text, \Normalizer::FORM_D);
            $text = is_string($decomposed) ? (string) preg_replace('/\p{Mn}+/u', '', $decomposed) : $text;
        }

        return (string) preg_replace('/\s+/u', ' ', str_replace('.', '', $text));
    }

    /**
     * @param  array{lat: float, lon: float, country: ?string, timezone: ?string}  $coords
     * @return array<string, mixed>|null
     */
    private function weather(array $coords, ?string $placeCountry, string $zone, CarbonImmutable $now): ?array
    {
        $country = $placeCountry ?? $coords['country'];
        $imperial = $country !== null && in_array($country, self::IMPERIAL, true);
        $key = sprintf('pulse:weather:%.2f:%.2f:%s:%s', $coords['lat'], $coords['lon'], $zone, $imperial ? 'f' : 'c');

        $forecast = $this->remember($key, self::WEATHER_TTL, function () use ($coords, $zone, $imperial) {
            $response = Http::acceptJson()->connectTimeout(2)->timeout(4)->get(config('services.weather.forecast_url'), [
                'latitude' => $coords['lat'],
                'longitude' => $coords['lon'],
                'current' => 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
                'hourly' => 'temperature_2m,weather_code,precipitation_probability,is_day',
                'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
                'forecast_days' => 5,
                'timezone' => $zone,
                'temperature_unit' => $imperial ? 'fahrenheit' : 'celsius',
                'wind_speed_unit' => $imperial ? 'mph' : 'kmh',
            ]);

            if (!$response->successful() || !is_array($response->json('current'))) {
                Log::info('dashboard.pulse.weather_unavailable', ['step' => 'forecast', 'status' => $response->status()]);

                return null;
            }

            return $response->json();
        });

        return is_array($forecast) ? self::shape($forecast, $now, $imperial) : null;
    }

    /**
     * Open-Meteo's answer → what the dashboards draw. Times are the venue's wall clock (`timezone` was the venue's).
     *
     * @param  array<string, mixed>  $forecast
     * @return array<string, mixed>|null
     */
    public static function shape(array $forecast, CarbonImmutable $now, bool $imperial): ?array
    {
        $current = is_array($forecast['current'] ?? null) ? $forecast['current'] : null;
        if ($current === null || !is_numeric($current['temperature_2m'] ?? null)) {
            return null;
        }
        $num = static fn (mixed $v): ?float => is_numeric($v) ? round((float) $v, 1) : null;
        $int = static fn (mixed $v): ?int => is_numeric($v) ? (int) round((float) $v) : null;

        $hourly = is_array($forecast['hourly'] ?? null) ? $forecast['hourly'] : [];
        $hourTimes = is_array($hourly['time'] ?? null) ? $hourly['time'] : [];
        $thisHour = $now->format('Y-m-d\TH:00');
        $hours = [];
        foreach ($hourTimes as $i => $time) {
            if (!is_string($time) || $time < $thisHour) {
                continue;
            }
            $hours[] = [
                'time' => $time,
                'temp' => $num($hourly['temperature_2m'][$i] ?? null),
                'code' => $int($hourly['weather_code'][$i] ?? null),
                'rain_chance' => $int($hourly['precipitation_probability'][$i] ?? null),
                'is_day' => (bool) ($hourly['is_day'][$i] ?? true),
            ];
            if (count($hours) === 8) {
                break;
            }
        }

        $daily = is_array($forecast['daily'] ?? null) ? $forecast['daily'] : [];
        $dayTimes = is_array($daily['time'] ?? null) ? $daily['time'] : [];
        $days = [];
        foreach ($dayTimes as $i => $date) {
            if (!is_string($date)) {
                continue;
            }
            $days[] = [
                'date' => $date,
                'max' => $num($daily['temperature_2m_max'][$i] ?? null),
                'min' => $num($daily['temperature_2m_min'][$i] ?? null),
                'code' => $int($daily['weather_code'][$i] ?? null),
                'rain_chance' => $int($daily['precipitation_probability_max'][$i] ?? null),
                'sunrise' => is_string($daily['sunrise'][$i] ?? null) ? $daily['sunrise'][$i] : null,
                'sunset' => is_string($daily['sunset'][$i] ?? null) ? $daily['sunset'][$i] : null,
            ];
        }
        $today = $now->format('Y-m-d');
        $todayRow = collect($days)->firstWhere('date', $today) ?? ($days[0] ?? null);

        return [
            'current' => [
                'temp' => $num($current['temperature_2m']),
                'feels_like' => $num($current['apparent_temperature'] ?? null),
                'code' => $int($current['weather_code'] ?? null),
                'is_day' => (bool) ($current['is_day'] ?? true),
                'wind' => $num($current['wind_speed_10m'] ?? null),
                'humidity' => $int($current['relative_humidity_2m'] ?? null),
            ],
            'today' => $todayRow,
            'hours' => $hours,
            'days' => array_values(array_filter($days, static fn (array $d) => $d['date'] > $today)),
            'units' => ['temp' => $imperial ? 'F' : 'C', 'wind' => $imperial ? 'mph' : 'km/h'],
            'source' => 'Open-Meteo',
        ];
    }

    /**
     * Where a city is: looked up with its country, then without it (a country written in a way nothing reads). An array
     * when found, `not_found` when the provider knows no such city, null when it could not be asked.
     *
     * @return array{lat: float, lon: float, country: ?string, timezone: ?string}|'not_found'|null
     */
    private function coordinates(string $city, ?string $country): array|string|null
    {
        $tries = $country !== null ? [$country, null] : [null];
        foreach ($tries as $code) {
            $found = $this->lookUp($city, $code);
            if ($found !== 'not_found') {
                return $found;
            }
        }

        return 'not_found';
    }

    /**
     * @return array{lat: float, lon: float, country: ?string, timezone: ?string}|'not_found'|null
     */
    private function lookUp(string $city, ?string $country): array|string|null
    {
        // v2 (2026-11-09): the first key remembered a miss for 30 days, which kept a fixed location without weather.
        $key = 'pulse:place:v2:' . sha1(mb_strtolower($city) . '|' . ($country ?? ''));
        $store = SharedCache::store();
        $cached = $store->get($key);
        if (is_array($cached)) {
            return $cached;
        }
        if ($cached === 'not_found') {
            return 'not_found';
        }

        $found = $this->remember($key . ':ask', self::FAILURE_TTL, function () use ($city, $country) {
            $query = ['name' => $city, 'count' => 1, 'language' => 'en', 'format' => 'json'];
            if ($country !== null) {
                $query['countryCode'] = $country;
            }
            $response = Http::acceptJson()->connectTimeout(2)->timeout(4)->get(config('services.weather.geocoding_url'), $query);
            if (!$response->successful()) {
                Log::info('dashboard.pulse.weather_unavailable', ['step' => 'geocoding', 'status' => $response->status()]);

                return null;
            }
            $first = $response->json('results.0');
            if (!is_array($first) || !is_numeric($first['latitude'] ?? null) || !is_numeric($first['longitude'] ?? null)) {
                return 'not_found';
            }
            $zone = PortalBootstrap::namedZone($first['timezone'] ?? null);

            return [
                'lat' => round((float) $first['latitude'], 4),
                'lon' => round((float) $first['longitude'], 4),
                'country' => self::countryCode($first['country_code'] ?? null),
                'timezone' => $zone !== null && $zone !== 'UTC' ? $zone : null,
            ];
        });

        if (is_array($found)) {
            $store->put($key, $found, self::PLACE_TTL);
        } elseif ($found === 'not_found') {
            $store->put($key, 'not_found', self::MISS_TTL);
        }

        return $found;
    }

    /**
     * SharedCache::remember with a short memory of failures: an exception or a null answer is kept for FAILURE_TTL, so
     * an unreachable provider is asked again in five minutes rather than on every page.
     */
    private function remember(string $key, int $ttl, callable $fetch): mixed
    {
        $store = SharedCache::store();
        $cached = $store->get($key);
        if ($cached !== null) {
            return $cached === '__none__' ? null : $cached;
        }

        try {
            $value = $fetch();
        } catch (\Throwable $e) {
            Log::info('dashboard.pulse.weather_unavailable', ['key' => $key, 'error' => $e->getMessage()]);
            $value = null;
        }

        if ($value === null) {
            $store->put($key, '__none__', self::FAILURE_TTL);

            return null;
        }
        $store->put($key, $value, $ttl);

        return $value;
    }
}
