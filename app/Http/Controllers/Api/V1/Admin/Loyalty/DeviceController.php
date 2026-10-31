<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\StaffDevice;
use App\Services\Loyalty\Staff\StaffAlerts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The caller's own phone in the HexaTech Staff app, for request alerts (`StaffAlerts`). The app sends it after
 * signing in and on every start (which keeps `last_seen_at` fresh), changes `alerts` and `language` with it, and
 * removes it before signing out. A token is one phone: registering one another person used moves it to the caller.
 */
class DeviceController extends Controller
{
    private const TOKEN = '/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/';

    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token'    => ['required', 'string', 'max:255', 'regex:' . self::TOKEN],
            'platform' => ['nullable', Rule::in(['ios', 'android'])],
            'language' => ['nullable', Rule::in(StaffDevice::LANGUAGES)],
            'alerts'   => ['nullable', 'boolean'],
        ]);
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');

        $values = [
            'organization_id' => (int) $org->id,
            'user_id'         => (int) $request->user()->id,
            'app'             => StaffAlerts::APP,
            'platform'        => $data['platform'] ?? null,
            'last_seen_at'    => now(),
        ];
        // Language and the switch change only when sent, so a start that sends only the token keeps the person's choice.
        foreach (['language', 'alerts'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null) {
                $values[$field] = $data[$field];
            }
        }
        $device = StaffDevice::query()->updateOrCreate(['token' => $data['token']], $values);

        return response()->json(['device' => ['alerts' => (bool) ($device->alerts ?? true), 'language' => (string) ($device->language ?? 'en')]]);
    }

    public function remove(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:255']]);
        $removed = StaffDevice::query()->where('token', $data['token'])->where('user_id', $request->user()->id)->delete();

        return response()->json(['removed' => $removed > 0]);
    }
}
