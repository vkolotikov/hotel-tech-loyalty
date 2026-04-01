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
        'stripe_secret_key', 'stripe_webhook_secret',
        'twilio_auth_token',
        'whatsapp_access_token', 'whatsapp_verify_token',
        'google_maps_api_key',
        'custom_webhook_secret',
        // PMS provider secrets
        'cloudbeds_api_key', 'cloudbeds_client_secret',
        'mews_access_token', 'mews_client_token',
        'guesty_api_key', 'guesty_api_secret',
        'hostaway_api_key',
        'beds24_api_key',
        'lodgify_api_key',
        'little_hotelier_api_key',
        'roomraccoon_api_key',
        // Channel secrets
        'booking_com_api_key',
        'airbnb_api_key',
        'expedia_api_key',
    ];

    /** Env fallback map: setting key → env variable name. */
    private const ENV_FALLBACKS = [
        'ai_openai_api_key'            => 'OPENAI_API_KEY',
        'ai_openai_model'              => 'OPENAI_MODEL',
        'ai_anthropic_api_key'         => 'ANTHROPIC_API_KEY',
        'ai_anthropic_model'           => 'ANTHROPIC_MODEL',
        'booking_smoobu_api_key'       => 'SMOOBU_API_KEY',
        'booking_smoobu_channel_id'    => 'SMOOBU_CHANNEL_ID',
        'booking_smoobu_base_url'      => 'SMOOBU_BASE_URL',
        'booking_smoobu_webhook_secret' => 'SMOOBU_WEBHOOK_SECRET',
        'mail_host'                    => 'MAIL_HOST',
        'mail_port'                    => 'MAIL_PORT',
        'mail_username'                => 'MAIL_USERNAME',
        'mail_password'                => 'MAIL_PASSWORD',
        'mail_from_address'            => 'MAIL_FROM_ADDRESS',
        'mail_from_name'               => 'MAIL_FROM_NAME',
        'expo_access_token'            => 'EXPO_ACCESS_TOKEN',
        'stripe_publishable_key'       => 'STRIPE_PUBLISHABLE_KEY',
        'stripe_secret_key'            => 'STRIPE_SECRET_KEY',
        'stripe_webhook_secret'        => 'STRIPE_WEBHOOK_SECRET',
        'stripe_currency'              => 'STRIPE_CURRENCY',
        'twilio_account_sid'           => 'TWILIO_ACCOUNT_SID',
        'twilio_auth_token'            => 'TWILIO_AUTH_TOKEN',
        'twilio_phone_number'          => 'TWILIO_PHONE_NUMBER',
        'whatsapp_phone_id'            => 'WHATSAPP_PHONE_ID',
        'whatsapp_access_token'        => 'WHATSAPP_ACCESS_TOKEN',
        'whatsapp_verify_token'        => 'WHATSAPP_VERIFY_TOKEN',
        'google_maps_api_key'          => 'GOOGLE_MAPS_API_KEY',
        'google_analytics_id'          => 'GOOGLE_ANALYTICS_ID',
        'google_tag_manager_id'        => 'GOOGLE_TAG_MANAGER_ID',
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $staff = $user?->staff;
        $isSuperAdmin = $staff && $staff->role === 'super_admin';

        $query = HotelSetting::query();
        // Non-super-admins can only see company-scoped settings
        if (!$isSuperAdmin) {
            $query->where(function ($q) {
                $q->where('scope', 'company')->orWhereNull('scope');
            });
        }

        $settings = $query->get()->groupBy('group')->map(function ($group) {
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
                    'scope'       => $setting->scope ?? 'company',
                ];
            })->values(); // Reset keys so JSON serializes as array, not object
        });

        // Include the org's widget token for the booking embed code
        $widgetToken = null;
        if ($user && $user->organization_id) {
            $org = \App\Models\Organization::find($user->organization_id);
            $widgetToken = $org?->widget_token;
        }

        return response()->json(['settings' => $settings, 'widget_token' => $widgetToken]);
    }

    public function theme(): JsonResponse
    {
        // Public endpoint — bypass tenant scope but only return appearance settings.
        // In multi-tenant context, the org is resolved from query param if provided.
        $query = HotelSetting::withoutGlobalScopes()->where('group', 'appearance');

        // If org context is available (e.g., from request), scope to it
        if (app()->bound('current_organization_id') && app('current_organization_id')) {
            $query->where('organization_id', app('current_organization_id'));
        }

        $settings = $query->pluck('value', 'key');
        return response()->json(['theme' => $settings]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $staff = $user?->staff;
        $isSuperAdmin = $staff && $staff->role === 'super_admin';

        $validated = $request->validate([
            'settings'         => 'required|array',
            'settings.*.key'   => 'required|string',
            'settings.*.value' => 'present',
        ]);

        foreach ($validated['settings'] as $item) {
            $setting = HotelSetting::where('key', $item['key'])->first();

            // Non-super-admins cannot write system-scoped settings
            if (!$isSuperAdmin && $setting && $setting->scope === 'system') {
                continue;
            }

            // Skip empty secret submissions (user didn't type a new key)
            if (in_array($item['key'], self::SECRET_KEYS) && ($item['value'] === '' || $item['value'] === null)) {
                continue;
            }

            $oldValue = $setting?->value;

            if ($setting) {
                $setting->update(['value' => is_array($item['value']) ? json_encode($item['value']) : (string) $item['value']]);
            } else {
                // Only super_admin can create new setting keys
                if (!$isSuperAdmin) {
                    continue;
                }
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
            'logo' => 'required|image|mimes:jpeg,png,jpg,webp|max:4096',
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

    /** Test an integration connection (manager+ only). */
    public function testIntegration(Request $request): JsonResponse
    {
        $staff = $request->user()?->staff;
        if (!$staff || !in_array($staff->role, ['super_admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Insufficient permissions'], 403);
        }

        $type = $request->input('type');

        return match ($type) {
            'openai'    => $this->testOpenAi(),
            'anthropic' => $this->testAnthropic(),
            'smoobu'    => $this->testSmoobu(),
            'mail'      => $this->testMail(),
            'stripe'    => $this->testStripe(),
            'twilio'    => $this->testTwilio(),
            'whatsapp'  => $this->testWhatsApp(),
            'google_maps' => $this->testGoogleMaps(),
            default     => response()->json(['success' => false, 'message' => 'Unknown integration type']),
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

    private function resolveKey(string $settingKey, string $envKey): ?string
    {
        $val = HotelSetting::getValue($settingKey);
        if ($val && $val !== '') return $val;
        $env = env($envKey);
        return ($env && $env !== '') ? $env : null;
    }

    private function curlTest(string $url, array $headers, int $timeout = 10): array
    {
        try {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_HTTPHEADER     => $headers,
            ]);
            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return ['success' => false, 'message' => "Connection failed: {$error}"];
            return ['success' => $code >= 200 && $code < 300, 'message' => ($code >= 200 && $code < 300) ? 'Connected' : "HTTP {$code}"];
        } catch (\Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    private function testOpenAi(): JsonResponse
    {
        $key = $this->resolveKey('ai_openai_api_key', 'OPENAI_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $result = $this->curlTest('https://api.openai.com/v1/models', ["Authorization: Bearer {$key}"]);
        return response()->json($result);
    }

    private function testAnthropic(): JsonResponse
    {
        $key = $this->resolveKey('ai_anthropic_api_key', 'ANTHROPIC_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $result = $this->curlTest('https://api.anthropic.com/v1/models', ["x-api-key: {$key}", "anthropic-version: 2023-06-01"]);
        return response()->json($result);
    }

    private function testSmoobu(): JsonResponse
    {
        $key = $this->resolveKey('booking_smoobu_api_key', 'SMOOBU_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $base = $this->resolveKey('booking_smoobu_base_url', 'SMOOBU_BASE_URL') ?? 'https://login.smoobu.com/api';
        $result = $this->curlTest("{$base}/apartment", ["Api-Key: {$key}", "Content-Type: application/json"]);
        return response()->json($result);
    }

    private function testMail(): JsonResponse
    {
        $host = $this->resolveKey('mail_host', 'MAIL_HOST');
        if (!$host) return response()->json(['success' => false, 'message' => 'No SMTP host configured']);

        $port = (int) ($this->resolveKey('mail_port', 'MAIL_PORT') ?? 587);
        try {
            $conn = @fsockopen($host, $port, $errno, $errstr, 5);
            if ($conn) { fclose($conn); return response()->json(['success' => true, 'message' => "SMTP reachable on {$host}:{$port}"]); }
            return response()->json(['success' => false, 'message' => "Cannot reach {$host}:{$port}: {$errstr}"]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testStripe(): JsonResponse
    {
        $key = $this->resolveKey('stripe_secret_key', 'STRIPE_SECRET_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No secret key configured']);

        $result = $this->curlTest('https://api.stripe.com/v1/balance', ["Authorization: Bearer {$key}"]);
        return response()->json($result);
    }

    private function testTwilio(): JsonResponse
    {
        $sid = $this->resolveKey('twilio_account_sid', 'TWILIO_ACCOUNT_SID');
        $token = $this->resolveKey('twilio_auth_token', 'TWILIO_AUTH_TOKEN');
        if (!$sid || !$token) return response()->json(['success' => false, 'message' => 'Account SID and Auth Token required']);

        try {
            $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$sid}.json");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_USERPWD        => "{$sid}:{$token}",
            ]);
            curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return response()->json(['success' => false, 'message' => "Connection failed: {$error}"]);
            return response()->json(['success' => $code === 200, 'message' => $code === 200 ? 'Connected' : "HTTP {$code}"]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    private function testWhatsApp(): JsonResponse
    {
        $phoneId = $this->resolveKey('whatsapp_phone_id', 'WHATSAPP_PHONE_ID');
        $token = $this->resolveKey('whatsapp_access_token', 'WHATSAPP_ACCESS_TOKEN');
        if (!$phoneId || !$token) return response()->json(['success' => false, 'message' => 'Phone Number ID and Access Token required']);

        $result = $this->curlTest(
            "https://graph.facebook.com/v19.0/{$phoneId}",
            ["Authorization: Bearer {$token}"]
        );
        return response()->json($result);
    }

    private function testGoogleMaps(): JsonResponse
    {
        $key = $this->resolveKey('google_maps_api_key', 'GOOGLE_MAPS_API_KEY');
        if (!$key) return response()->json(['success' => false, 'message' => 'No API key configured']);

        $result = $this->curlTest(
            "https://maps.googleapis.com/maps/api/geocode/json?address=test&key={$key}",
            []
        );
        return response()->json($result);
    }
}
