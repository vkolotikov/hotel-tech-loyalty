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
 * - The weather is Open-Meteo's (no key, no personal data: only the city's name and coordinates leave the server).
 *   Both answers live in SharedCache (the place for 30 days, the weather for 20 minutes); a failure is remembered for
 *   5 minutes, so a provider that is down costs one short wait, not one per page. The weather is null whenever it is
 *   not known — the dashboards then show the clock alone; a dashboard never fails because of the weather.
 */
final class VenuePulse
{
    /** Countries that read temperatures in Fahrenheit and wind in miles an hour. */
    private const IMPERIAL = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'];

    private const PLACE_TTL = 2592000;   // 30 days

    private const WEATHER_TTL = 1200;    // 20 minutes

    private const FAILURE_TTL = 300;     // 5 minutes

    /**
     * @return array{timezone: string, now: string, today: string, currency: string, place: array{name: string, country: ?string, source: string}|null, weather: array<string, mixed>|null}
     */
    public function for(Organization $org): array
    {
        $zone = AppointmentClock::zoneFor((int) $org->id);
        $now = CarbonImmutable::now($zone);
        $place = $this->place($org, $zone);

        return [
            'timezone' => $zone,
            'now' => $now->toIso8601String(),
            'today' => $now->format('Y-m-d'),
            // The venue's currency, as the workspaces read it, so a dashboard's money reads in it.
            'currency' => PortalBootstrap::currency($org),
            'place' => $place,
            'weather' => $place !== null && config('services.weather.enabled', true) ? $this->weather($place, $zone, $now) : null,
        ];
    }

    /**
     * @return array{name: string, country: ?string, source: string}|null
     */
    public function place(Organization $org, string $zone): ?array
    {
        $property = Property::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->whereNotNull('city')
            ->where('city', '!=', '')
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->first(['id', 'city', 'country']);

        if ($property !== null && trim((string) $property->city) !== '') {
            return [
                'name' => mb_substr(trim((string) $property->city), 0, 100),
                'country' => self::countryCode($property->country) ?? self::countryCode($org->country ?? null),
                'source' => 'location',
            ];
        }

        $city = self::cityOfZone($zone);
        if ($city === null) {
            return null;
        }

        return ['name' => $city, 'country' => self::countryCode($org->country ?? null), 'source' => 'timezone'];
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

    /** A two-letter country code, upper-case, or null: a location's country is free text (`Latvia`, `lv`). */
    public static function countryCode(mixed $raw): ?string
    {
        $value = strtoupper(trim((string) $raw));

        return preg_match('/^[A-Z]{2}$/', $value) === 1 ? $value : null;
    }

    /**
     * @param  array{name: string, country: ?string, source: string}  $place
     * @return array<string, mixed>|null
     */
    private function weather(array $place, string $zone, CarbonImmutable $now): ?array
    {
        $coords = $this->coordinates($place['name'], $place['country']);
        if ($coords === null) {
            return null;
        }
        $country = $place['country'] ?? $coords['country'];
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

            return $response->successful() && is_array($response->json('current')) ? $response->json() : null;
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
     * @return array{lat: float, lon: float, country: ?string}|null
     */
    private function coordinates(string $city, ?string $country): ?array
    {
        $key = 'pulse:place:' . sha1(mb_strtolower($city) . '|' . ($country ?? ''));

        $found = $this->remember($key, self::PLACE_TTL, function () use ($city, $country) {
            $query = ['name' => $city, 'count' => 1, 'language' => 'en', 'format' => 'json'];
            if ($country !== null) {
                $query['countryCode'] = $country;
            }
            $response = Http::acceptJson()->connectTimeout(2)->timeout(4)->get(config('services.weather.geocoding_url'), $query);
            $first = $response->successful() ? $response->json('results.0') : null;
            if (!is_array($first) || !is_numeric($first['latitude'] ?? null) || !is_numeric($first['longitude'] ?? null)) {
                return false;   // a city the provider does not know: remembered as "no place" for as long as a place
            }

            return [
                'lat' => round((float) $first['latitude'], 4),
                'lon' => round((float) $first['longitude'], 4),
                'country' => self::countryCode($first['country_code'] ?? null),
            ];
        });

        return is_array($found) ? $found : null;
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
