<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingsController extends Controller
{
    /** Keys that contain secrets — returned masked unless explicitly empty. */
    private const SECRET_KEYS = [
        'ai_openai_api_key', 'ai_anthropic_api_key',
        'booking_smoobu_api_key', 'booking_smoobu_webhook_secret',
        'mail_password', 'expo_access_token',
    ];

    /** Env fallback map: setting key → env variable name. */
    private const ENV_FALLBACKS = [
        'ai_openai_api_key'          => 'OPENAI_API_KEY',
        'ai_openai_model'            => 'OPENAI_MODEL',
        'ai_anthropic_api_key'       => 'ANTHROPIC_API_KEY',
        'ai_anthropic_model'         => 'ANTHROPIC_MODEL',
        'booking_smoobu_api_key'     => 'SMOOBU_API_KEY',
        'booking_smoobu_channel_id'  => 'SMOOBU_CHANNEL_ID',
        'booking_smoobu_base_url'    => 'SMOOBU_BASE_URL',
        'booking_smoobu_webhook_secret' => 'SMOOBU_WEBHOOK_SECRET',
        'mail_host'                  => 'MAIL_HOST',
        'mail_port'                  => 'MAIL_PORT',
        'mail_username'              => 'MAIL_USERNAME',
        'mail_password'              => 'MAIL_PASSWORD',
        'mail_from_address'          => 'MAIL_FROM_ADDRESS',
        'mail_from_name'             => 'MAIL_FROM_NAME',
        'expo_access_token'          => 'EXPO_ACCESS_TOKEN',
    ];

    public function index(): JsonResponse
    {
        $settings = HotelSetting::all()->groupBy('group')->map(function ($group) {
            return $group->map(function ($setting) {
                $value = $setting->typed_value;

                // If DB value is empty, try env fallback
                if (($value === '' || $value === null) && isset(self::ENV_FALLBACKS[$setting->key])) {
                    $envVal = env(self::ENV_FALLBACKS[$setting->key]);
                    if ($envVal !== null && $envVal !== '') {
                        $value = $envVal;
                    }
                }

                // Mask secret keys
                $isSecret = in_array($setting->key, self::SECRET_KEYS);
                $masked = $isSecret && $value ? $this->maskSecret((string) $value) : null;

                return [
                    'id'          => $setting->id,
                    'key'         => $setting->key,
                    'value'       => $isSecret ? '' : $value, // never send raw secrets
                    'masked'      => $masked,
                    'has_value'   => $value !== '' && $value !== null,
                    'source'      => $this->getValueSource($setting),
                    'type'        => $setting->type,
                    'label'       => $setting->label,
                    'description' => $setting->description,
                ];
            });
        });

        return response()->json(['settings' => $settings]);
    }

    public function theme(): JsonResponse
    {
        $settings = HotelSetting::where('group', 'appearance')->pluck('value', 'key');
        return response()->json(['theme' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings'         => 'required|array',
            'settings.*.key'   => 'required|string',
            'settings.*.value' => 'present',
        ]);

        foreach ($validated['settings'] as $item) {
            $setting = HotelSetting::where('key', $item['key'])->first();

            // Skip empty secret submissions (user didn't type a new key)
            if (in_array($item['key'], self::SECRET_KEYS) && ($item['value'] === '' || $item['value'] === null)) {
                continue;
            }

            $oldValue = $setting?->value;

            if ($setting) {
                $setting->update(['value' => is_array($item['value']) ? json_encode($item['value']) : (string) $item['value']]);
            } else {
                // Auto-create if key doesn't exist yet (upsert)
                HotelSetting::create([
                    'key'   => $item['key'],
                    'value' => is_array($item['value']) ? json_encode($item['value']) : (string) $item['value'],
                    'type'  => 'string',
                    'group' => 'custom',
                    'label' => ucwords(str_replace('_', ' ', $item['key'])),
                ]);
            }

            AuditLog::record(
                'setting_updated',
                $setting ?? HotelSetting::where('key', $item['key'])->first(),
                ['value' => in_array($item['key'], self::SECRET_KEYS) ? '***' : $item['value']],
                ['value' => in_array($item['key'], self::SECRET_KEYS) ? '***' : $oldValue],
                $request->user(),
                "Setting '{$item['key']}' changed"
            );
        }

        return response()->json(['message' => 'Settings updated']);
    }

    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => 'required|image|mimes:jpeg,png,jpg,webp,svg|max:4096',
        ]);

        $path = $request->file('logo')->store('logos', 'public');
        $url  = '/storage/' . $path;

        $setting = HotelSetting::where('key', 'company_logo')->first();
        if ($setting) {
            $oldPath = str_replace('/storage/', '', $setting->value ?? '');
            if ($oldPath && Storage::disk('public')->exists($oldPath)) {
                Storage::disk('public')->delete($oldPath);
            }
            $setting->update(['value' => $url]);
        } else {
            HotelSetting::create([
                'key'         => 'company_logo',
                'value'       => $url,
                'type'        => 'string',
                'group'       => 'appearance',
                'label'       => 'Company Logo',
                'description' => 'Logo displayed in the app header and member cards',
            ]);
        }

        AuditLog::record('logo_uploaded', HotelSetting::where('key', 'company_logo')->first(),
            ['url' => $url], [], $request->user(), 'Company logo updated');

        return response()->json(['message' => 'Logo uploaded', 'url' => $url]);
    }

    /** Test an integration connection. */
    public function testIntegration(Request $request): JsonResponse
    {
        $type = $request->input('type');

        return match ($type) {
            'openai' => $this->testOpenAi(),
            'anthropic' => $this->testAnthropic(),
            'smoobu' => $this->testSmoobu(),
            'mail' => $this->testMail(),
            default => response()->json(['success' => false, 'message' => 'Unknown integration type']),
        };
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private function maskSecret(string $value): string
    {
        if (strlen($value) <= 8) return '••••••••';
        return substr($value, 0, 4) . str_repeat('•', min(20, strlen($value) - 8)) . substr($value, -4);
    }

    private function getValueSource(HotelSetting $setting): string
    {
        if ($setting->value !== '' && $setting->value !== null) return 'database';
        if (isset(self::ENV_FALLBACKS[$setting->key])) {
            $envVal = env(self::ENV_FALLBACKS[$setting->key]);
            if ($envVal !== null && $envVal !== '') return 'env';
        }
        return 'empty';
    }

    private function testOpenAi(): JsonResponse
    {
        $key = HotelSetting::getValue('ai_openai_api_key') ?: env('OPENAI_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        try {
            $ch = curl_init('https://api.openai.com/v1/models');
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => ["Authorization: Bearer {$key}"]]);
            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return response()->json(['success' => $code === 200, 'message' => $code === 200 ? 'Connected' : 'Auth failed (HTTP ' . $code . ')']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testAnthropic(): JsonResponse
    {
        $key = HotelSetting::getValue('ai_anthropic_api_key') ?: env('ANTHROPIC_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        try {
            $ch = curl_init('https://api.anthropic.com/v1/models');
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => ["x-api-key: {$key}", "anthropic-version: 2023-06-01"]]);
            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return response()->json(['success' => $code === 200, 'message' => $code === 200 ? 'Connected' : 'Auth failed (HTTP ' . $code . ')']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testSmoobu(): JsonResponse
    {
        $key = HotelSetting::getValue('booking_smoobu_api_key') ?: env('SMOOBU_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $base = HotelSetting::getValue('booking_smoobu_base_url') ?: env('SMOOBU_BASE_URL', 'https://login.smoobu.com/api');
        try {
            $ch = curl_init("{$base}/apartment");
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => ["Api-Key: {$key}", "Content-Type: application/json"]]);
            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return response()->json(['success' => $code === 200, 'message' => $code === 200 ? 'Connected' : 'Auth failed (HTTP ' . $code . ')']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testMail(): JsonResponse
    {
        $host = HotelSetting::getValue('mail_host') ?: env('MAIL_HOST');
        if (!$host) return response()->json(['success' => false, 'message' => 'No SMTP host configured']);

        $port = (int) (HotelSetting::getValue('mail_port') ?: env('MAIL_PORT', 587));
        try {
            $conn = @fsockopen($host, $port, $errno, $errstr, 5);
            if ($conn) { fclose($conn); return response()->json(['success' => true, 'message' => "SMTP reachable on {$host}:{$port}"]); }
            return response()->json(['success' => false, 'message' => "Cannot reach {$host}:{$port}: {$errstr}"]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }
}
