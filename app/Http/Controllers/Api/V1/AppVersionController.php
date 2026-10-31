<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Which versions of a native app the server still serves (`config/apps.php`): public, before sign-in, so an app too
 * old to talk to the server can still say "Update". The app compares its own version; nothing here reads the caller.
 */
class AppVersionController extends Controller
{
    private const VERSION = '/^\d{1,4}\.\d{1,4}\.\d{1,4}$/';

    public function show(string $app): JsonResponse
    {
        $config = config("apps.{$app}");
        if (!is_array($config)) {
            return response()->json(['error' => 'not_found', 'message' => 'No such app.'], 404);
        }

        $min = self::version($config['min_version'] ?? null, $app, 'min_version') ?? '0.0.0';
        $latest = self::version($config['latest_version'] ?? null, $app, 'latest_version') ?? $min;

        return response()->json([
            'app'            => $app,
            'min_version'    => $min,
            'latest_version' => version_compare($latest, $min, '<') ? $min : $latest,
            'update_url'     => [
                'ios'     => self::url($config['ios_url'] ?? null),
                'android' => self::url($config['android_url'] ?? null),
            ],
        ])->header('Cache-Control', 'public, max-age=300');
    }

    /** A configured version, or null (logged) when it is not one: a typo must never lock every phone out. */
    private static function version(mixed $value, string $app, string $key): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        if (preg_match(self::VERSION, $value) !== 1) {
            Log::warning('App version setting is not a version; ignored', ['app' => $app, 'key' => $key]);

            return null;
        }

        return $value;
    }

    private static function url(mixed $value): ?string
    {
        $value = trim((string) $value);

        return str_starts_with($value, 'https://') ? $value : null;
    }
}
