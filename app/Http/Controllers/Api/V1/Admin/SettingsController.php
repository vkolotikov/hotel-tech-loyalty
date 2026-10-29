<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class SettingsController extends Controller
{
    /** The admin styles `theme_style` may hold (Settings → Branding → Style). Glass, Classic or Clean light. */
    public const THEME_STYLES = ['glass', 'classic', 'light'];

    /** Keys that contain secrets — returned masked unless explicitly empty. */
    private const SECRET_KEYS = \App\Support\SettingRegistry::SECRET_KEYS;

    /**
     * Env fallback map: setting key → env variable name.
     *
     * IMPORTANT: this is a multi-tenant customer portal — each customer
     * must configure their own keys. Stripe entries are intentionally
     * absent from this map so an org with empty keys cannot accidentally
     * fall back to the platform's `.env` and charge OUR Stripe account
     * (or worse, leak across tenants).
     */
    // Payment-class secrets (Stripe + Smoobu webhook secret) must NOT be env-fallbacked — each tenant configures their own.
    private const ENV_FALLBACKS = [
        'ai_openai_api_key'            => 'OPENAI_API_KEY',
        'ai_openai_model'              => 'OPENAI_MODEL',
        'ai_anthropic_api_key'         => 'ANTHROPIC_API_KEY',
        'ai_anthropic_model'           => 'ANTHROPIC_MODEL',
        'booking_smoobu_api_key'       => 'SMOOBU_API_KEY',
        'booking_smoobu_channel_id'    => 'SMOOBU_CHANNEL_ID',
        'expo_access_token'            => 'EXPO_ACCESS_TOKEN',
        // stripe_* keys are deliberately NOT listed here — each customer
        // must use their own Stripe account. No platform fallback.
        'twilio_auth_token'            => 'TWILIO_AUTH_TOKEN',
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

        // Lazy-seed default hotel_settings rows (appearance colors, general) for
        // the current tenant so the Settings UI renders editable inputs and the
        // theme endpoint returns values. Idempotent — only creates missing keys.
        $this->ensureTenantHasDefaultSettings();

        $settings = HotelSetting::query()->get()->filter(function ($setting) use ($isSuperAdmin) {
            $definition = \App\Support\SettingRegistry::get($setting->key);
            if (!$definition || (!$isSuperAdmin && \App\Support\SettingRegistry::ownerOnly($setting->key))) {
                return false;
            }
            $setting->group = $definition['group'];
            $setting->scope = $definition['scope'];
            $setting->type = $definition['type'];
            return true;
        })->groupBy('group')->map(function ($group) {
            return $group->map(function ($setting) {
                $value = $setting->typed_value;
                if ($setting->key === 'booking_smoobu_base_url') {
                    $value = \App\Support\SmoobuEndpoint::BASE;
                }

                $isSecret = in_array($setting->key, self::SECRET_KEYS);

                // If the org's own value is empty, fall back to the platform's
                // env value so the UI can show what is actually in effect.
                //
                // NEVER for a secret. The env fallbacks point at the PLATFORM's
                // own credentials, and the masked form below discloses the
                // first four and last four characters — so for the 10-character
                // production MAIL_PASSWORD this handed 8 of its 10 characters
                // to every tenant super_admin who opened Settings, for an org
                // that had configured nothing. Anyone who reassembled it could
                // send as the platform's own domain, which is the fastest
                // possible way to destroy the sending reputation every tenant
                // shares.
                //
                // A secret an org has not set now reads as "not set", which is
                // the truth.
                if (!$isSecret
                    && ($value === '' || $value === null)
                    && isset(self::ENV_FALLBACKS[$setting->key])
                ) {
                    $envVal = env(self::ENV_FALLBACKS[$setting->key]);
                    if ($envVal !== null && $envVal !== '') {
                        $value = $envVal;
                    }
                }

                // Mask secret keys
                $masked = $isSecret && $value ? ($setting->key === 'twilio_auth_token' ? str_repeat('•', 8) : $this->maskSecret((string) $value)) : null;

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
        // Resolve org from: tenant context → authenticated user → query param.
        // CRITICAL: if NO org can be resolved, return DEFAULTS — not the
        // pluck of all-tenant rows. Without this, an unauthed call would
        // silently merge appearance settings across every customer's org,
        // and the FIRST writer's color for each key would win (last-pluck
        // wins). That was likely the root of the customer-reported
        // 'I picked Rose Boutique but after refresh it reverted' bug, even
        // when the save succeeded — /v1/theme returned the WRONG colors,
        // useTheme's useEffect then persisted them to localStorage, and
        // the next reload painted those wrong colors instead of the real
        // saved ones.
        $orgId = $this->resolveOrgForPublicTheme();

        // No org resolvable → return empty (NOT cross-tenant data).
        // The client will fall through to its hardcoded defaults instead
        // of painting another customer's branding.
        if (!$orgId) {
            return $this->themeResponse([], []);
        }

        $theme = HotelSetting::withoutGlobalScopes()
            ->where('group', 'appearance')
            ->where('organization_id', $orgId)
            ->pluck('value', 'key');

        $mobileTheme = HotelSetting::withoutGlobalScopes()
            ->where('group', 'mobile_app')
            ->where('organization_id', $orgId)
            ->pluck('value', 'key');

        return $this->themeResponse($theme->toArray(), $mobileTheme->toArray());
    }

    /**
     * Authenticated counterpart to `theme()`. Same payload shape, but routed
     * through saas.auth + tenant middleware so the org binding is
     * guaranteed. The admin SPA's useTheme hook calls this endpoint
     * whenever a token is in localStorage; /v1/theme stays for public
     * widgets that pass ?org_id.
     */
    public function adminTheme(Request $request): JsonResponse
    {
        $orgId = $request->user()?->organization_id
            ?? (app()->bound('current_organization_id') ? app('current_organization_id') : null);

        if (!$orgId) {
            return $this->themeResponse([], []);
        }

        $theme = HotelSetting::withoutGlobalScopes()
            ->where('group', 'appearance')
            ->where('organization_id', $orgId)
            ->pluck('value', 'key');

        $mobileTheme = HotelSetting::withoutGlobalScopes()
            ->where('group', 'mobile_app')
            ->where('organization_id', $orgId)
            ->pluck('value', 'key');

        return $this->themeResponse($theme->toArray(), $mobileTheme->toArray());
    }

    /** Shared response builder so theme() + adminTheme() can't drift. */
    private function themeResponse(array $theme, array $mobileTheme): JsonResponse
    {
        return response()->json([
            'theme'        => (object) $theme, // cast to object so empty {} not []
            'mobile_theme' => (object) $mobileTheme,
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
          ->header('Pragma', 'no-cache')
          ->header('Expires', '0');
    }

    /** Walk the public-route auth chain to pull an org id. */
    private function resolveOrgForPublicTheme(): ?int
    {
        if (app()->bound('current_organization_id') && app('current_organization_id')) {
            return (int) app('current_organization_id');
        }

        // Sanctum personal access token (the admin SPA's auth_token).
        $user = auth('sanctum')->user();
        if ($user) {
            $staff = \App\Models\Staff::withoutGlobalScopes()
                ->where('user_id', $user->id)
                ->first();
            $orgId = $staff?->organization_id ?? $user->organization_id ?? null;
            if ($orgId) return (int) $orgId;
        }

        // Belt-and-braces: read the bearer token directly and walk
        // personal_access_tokens. Auth guard occasionally fails to resolve
        // on routes where Sanctum's request lifecycle wasn't initialized
        // (e.g. truly public routes with no auth middleware at all).
        $authHeader = request()->header('Authorization', '');
        if ($authHeader && str_starts_with(strtolower($authHeader), 'bearer ')) {
            $token = trim(substr($authHeader, 7));
            if ($token && str_contains($token, '|')) {
                $pat = \Laravel\Sanctum\PersonalAccessToken::findToken($token);
                if ($pat && $pat->tokenable) {
                    $tokenable = $pat->tokenable;
                    $staff = \App\Models\Staff::withoutGlobalScopes()
                        ->where('user_id', $tokenable->id)
                        ->first();
                    $orgId = $staff?->organization_id ?? $tokenable->organization_id ?? null;
                    if ($orgId) return (int) $orgId;
                }
            }
            // SaaS JWT (different format — no `|` separator).
            if ($token && !str_contains($token, '|')) {
                $orgId = $this->resolveOrgFromSaasJwt($token);
                if ($orgId) return (int) $orgId;
            }
        }

        // Query param fallback for public widgets.
        $param = request()->input('org_id');
        return $param ? (int) $param : null;
    }

    public function update(Request $request): JsonResponse
    {
        $staff = $request->user()?->staff;
        $isSuperAdmin = $staff && $staff->role === 'super_admin' && $staff->is_active;
        $validated = $request->validate([
            'settings' => 'required|array|max:250', 'settings.*.key' => 'required|string|max:191|distinct',
            'settings.*.value' => 'present',
        ]);
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if (!$orgId) {
            return response()->json(['message' => 'Cannot save settings — no organization context bound. Please re-login.'], 422);
        }
        // Validate every key and permission before writing anything. DB metadata never grants authority.
        foreach ($validated['settings'] as $item) {
            $key = $item['key'];
            if (\App\Support\SettingRegistry::get($key) === null || $key === 'company_logo') {
                throw ValidationException::withMessages(['settings' => 'Unknown or read-only setting: ' . $key]);
            }
            if (!$isSuperAdmin && \App\Support\SettingRegistry::ownerOnly($key)) {
                abort(403, 'Only an owner can change integration settings.');
            }
            if ($key === 'theme_style' && !in_array($item['value'], self::THEME_STYLES, true)) {
                throw ValidationException::withMessages(['theme_style' => 'theme_style must be glass, classic or light.']);
            }
            if ($key === 'booking_smoobu_base_url' && !\App\Support\SmoobuEndpoint::accepts($item['value'])) {
                throw ValidationException::withMessages(['booking_smoobu_base_url' => 'Use the official Smoobu API address: ' . \App\Support\SmoobuEndpoint::BASE]);
            }
        }

        $programmeChanges = array_intersect_key(array_column($validated['settings'], 'value', 'key'),
            \App\Services\Loyalty\Programme\ProgrammeOptions::OPTIONS);
        \App\Services\Loyalty\Programme\ProgrammeOptions::validate((int) $orgId, $programmeChanges);

        return \Illuminate\Support\Facades\DB::transaction(function () use ($validated, $request, $orgId, $programmeChanges) {
            $written = 0;
            $skipped = 0;
            if ($programmeChanges !== []) {
                \App\Services\Loyalty\Programme\ProgrammeOptions::save((int) $orgId, $programmeChanges, $request->user());
            }
            foreach ($validated['settings'] as $item) {
                $key = $item['key'];
                $definition = \App\Support\SettingRegistry::get($key);
                if (array_key_exists($key, $programmeChanges)) {
                    // The shared programme writer owns values, switch dates and its audit.
                    HotelSetting::where('key', $key)->firstOrFail()->update([
                        'group' => $definition['group'], 'scope' => $definition['scope'], 'type' => $definition['type'],
                    ]);
                    $written++;
                    continue;
                }
                $secret = in_array($key, self::SECRET_KEYS, true);
                if ($secret && ($item['value'] === '' || $item['value'] === null)) {
                    $skipped++;
                    continue;
                }
                $setting = HotelSetting::where('key', $key)->first();
                $oldValue = $setting?->value;
                $attributes = [
                    'value' => is_array($item['value']) ? json_encode($item['value']) : (string) $item['value'],
                    'group' => $definition['group'], 'scope' => $definition['scope'], 'type' => $definition['type'],
                ];
                if ($setting) {
                    $setting->update($attributes);
                } else {
                    $setting = HotelSetting::create($attributes + ['key' => $key, 'label' => $definition['label']]);
                }
                $written++;
                AuditLog::record('setting_updated', $setting,
                    ['value' => $secret ? '***' : $item['value']], ['value' => $secret ? '***' : $oldValue],
                    $request->user(), "Setting '{$key}' changed");
            }
            $persisted = HotelSetting::whereIn('key', array_column($validated['settings'], 'key'))->get(['key', 'value'])
                ->mapWithKeys(fn ($row) => [$row->key => in_array($row->key, self::SECRET_KEYS, true) ? '***' : $row->value])->all();
            return response()->json(['message' => 'Settings updated', 'written' => $written, 'skipped' => $skipped, 'persisted' => $persisted])
                ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        });
    }
    /**
     * Lazy-seed a minimal set of hotel_settings rows for the current tenant.
     * Only creates keys that don't already exist for this org. Safe to call
     * repeatedly — only touches missing rows.
     */
    private function ensureTenantHasDefaultSettings(): void
    {
        if (!app()->bound('current_organization_id') || !app('current_organization_id')) {
            return;
        }

        $existingKeys = HotelSetting::pluck('key')->all();

        $defaults = \App\Support\SettingRegistry::defaults();

        foreach ($defaults as $d) {
            if (in_array($d['key'], $existingKeys, true)) {
                continue;
            }
            $scope = $d['scope'] ?? 'company';
            unset($d['scope']);
            HotelSetting::create(array_merge($d, ['scope' => $scope]));
        }
    }

    /**
     * Verify a SaaS-issued JWT and return the local organization_id.
     * Returns null if the token is invalid or the org doesn't exist locally.
     */
    private function resolveOrgFromSaasJwt(string $token): ?int
    {
        $secret = config('services.saas.jwt_secret', '');
        if (!$secret) return null;

        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $payload, $signature] = $parts;
        $expected = rtrim(strtr(base64_encode(
            hash_hmac('sha256', "$header.$payload", $secret, true)
        ), '+/', '-_'), '=');

        if (!hash_equals($expected, $signature)) return null;

        $data = json_decode(base64_decode(str_pad(
            strtr($payload, '-_', '+/'),
            strlen($payload) % 4 ? strlen($payload) + 4 - strlen($payload) % 4 : strlen($payload),
            '='
        )), true);

        if (!$data || (isset($data['exp']) && $data['exp'] < time())) return null;

        $saasOrgId = $data['currentOrgId'] ?? null;
        if (!$saasOrgId) return null;

        $org = \App\Models\Organization::where('saas_org_id', $saasOrgId)->first();
        return $org?->id;
    }

    /**
     * Infer the hotel_settings group for a key that has no template row yet.
     * Matches the conventions used in the seeder / frontend so a freshly-created
     * org can save settings without manual seeding.
     */
    private function inferGroup(string $key): string
    {
        $k = strtolower($key);
        // {integration}_enabled toggles live alongside their credentials in the
        // integrations group so the UI can find them next to the section.
        if (str_ends_with($k, '_enabled') && !str_starts_with($k, 'push_')
            && !str_starts_with($k, 'email_') && !str_starts_with($k, 'welcome_')
            && !str_starts_with($k, 'inbox_') && !str_starts_with($k, 'rating_')
            && !str_starts_with($k, 'lead_') && !str_starts_with($k, 'gdpr_')
            && !str_starts_with($k, 'dark_')) {
            return 'integrations';
        }
        if (str_starts_with($k, 'mobile_')) return 'mobile_app';
        // Theme/mobile preset NAME (added 2026-06) — keep in the
        // same groups so the /v1/theme endpoint picks them up alongside
        // the per-color values.
        if ($k === 'theme_preset_name') return 'appearance';
        // theme_mood (added 2026-06-13) drives the per-mood CSS-variable
        // cascade in the admin SPA — body font, heading font, corner
        // radius scale. Lives in the appearance group so the /v1/theme
        // endpoint picks it up alongside the per-color values.
        if ($k === 'theme_mood') return 'appearance';
        // theme_style (2026-10) picks the admin style (Glass, Classic or Clean light); it
        // travels with the colours through /v1/theme and /v1/admin/branding/theme.
        if ($k === 'theme_style') return 'appearance';
        if (in_array($k, ['primary_color','background_color','surface_color','secondary_color','text_color','text_secondary_color','border_color','success_color','error_color','warning_color','info_color','accent_color','company_logo','company_name','brand_font'])) return 'appearance';
        if (str_starts_with($k, 'booking_')) return 'booking';
        if (str_starts_with($k, 'mail_')) return 'email';
        if (str_starts_with($k, 'stripe_')) return 'billing';
        return 'general';
    }

    /**
     * POST /v1/admin/settings/logo — the venue's logo (Settings → Appearance). The full admin keeps its own
     * validation and answer; the write is AppLook::setLogo(), the one writer HexaTech Loyalty's upload uses too:
     * the `company_logo` row locked while it changes, a new file removed again if the row cannot be saved, and the
     * old file deleted only when it is this organisation's own in `logos` (release 3, R3-6).
     */
    public function uploadLogo(Request $request): JsonResponse
    {
        $request->validate([
            'logo' => 'required|image|mimes:jpeg,png,jpg,webp|max:4096',
        ]);

        $url = \App\Services\Loyalty\AppLook::setLogo($request->file('logo'), $request->user());

        return response()->json(['message' => 'Logo uploaded', 'url' => $url]);
    }

    /**
     * GET /v1/admin/integrations/sync-status — per-integration sync health.
     *
     * Today only Smoobu sync writes to the audit log; the response shape is
     * keyed by integration id so other PMSes can plug in without a frontend
     * rewrite. Returning relative ("2h ago") + ISO timestamps so the UI can
     * use either without re-formatting.
     */
    public function syncStatus(): JsonResponse
    {
        $smoobuLog = AuditLog::where('action', 'like', 'booking.sync%')
            ->orderByDesc('created_at')
            ->first();

        $recentHistory = AuditLog::where('action', 'like', 'booking.sync%')
            ->orderByDesc('created_at')
            ->limit(8)
            ->get(['id', 'action', 'description', 'created_at'])
            ->map(fn ($a) => [
                'id'           => $a->id,
                'action'       => $a->action,
                'description'  => $a->description,
                'created_at'   => $a->created_at?->toIso8601String(),
                'relative'     => $a->created_at?->diffForHumans(),
                'is_error'     => str_contains((string) $a->description, 'failed') && !str_contains((string) $a->description, '0 failed'),
            ]);

        // Quick parse of the most recent description for the headline counts —
        // the message is "PMS sync: 47 synced, 0 failed", regex pulls both
        // numbers when present.
        $synced = null; $errors = null;
        if ($smoobuLog && preg_match('/(\d+)\s+synced.*?(\d+)\s+failed/i', (string) $smoobuLog->description, $m)) {
            $synced = (int) $m[1];
            $errors = (int) $m[2];
        }

        return response()->json([
            'smoobu' => [
                'last_sync_at'       => $smoobuLog?->created_at?->toIso8601String(),
                'last_sync_relative' => $smoobuLog?->created_at?->diffForHumans(),
                'last_message'       => $smoobuLog?->description,
                'last_synced_count'  => $synced,
                'last_errors_count'  => $errors,
                'recent_history'     => $recentHistory,
                'mirrored_count'     => \App\Models\BookingMirror::count(),
            ],
        ]);
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
            'expo'      => $this->testExpoPush(),
            default     => response()->json(['success' => false, 'message' => 'Unknown integration type']),
        };
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    private function maskSecret(string $value): string
    {
        // Show only a short tail, and only when the secret is long enough that
        // a tail is not most of it.
        //
        // The old form revealed the first FOUR and last FOUR characters, which
        // for a 10-character password disclosed 8 of 10 — enough to reconstruct
        // by hand. A masked secret exists so an admin can recognise which
        // credential is set, not so they can read it.
        if (strlen($value) < 12) return '••••••••';
        return str_repeat('•', 8) . substr($value, -4);
    }

    private function getValueSource(HotelSetting $setting): string
    {
        if ($setting->key === 'booking_smoobu_base_url') return 'default';
        if ($setting->value !== '' && $setting->value !== null) return 'database';
        if (in_array($setting->key, self::SECRET_KEYS, true)) return 'empty';
        if (isset(self::ENV_FALLBACKS[$setting->key])) {
            $envVal = env(self::ENV_FALLBACKS[$setting->key]);
            if ($envVal !== null && $envVal !== '') return 'env';
        }
        return 'empty';
    }

    private function resolveKey(string $settingKey, string $envKey): ?string
    {
        // Secrets are intentionally excluded from HotelSetting's cache. Read this tenant's row directly.
        $val = HotelSetting::where('key', $settingKey)->first()?->value;
        if ($val && $val !== '') return $val;
        if (in_array($settingKey, self::SECRET_KEYS, true) || in_array($settingKey, ['twilio_account_sid', 'twilio_phone_number', 'whatsapp_phone_id'], true)) {
            return null;
        }
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

        $base = \App\Support\SmoobuEndpoint::BASE;

        // Hit page 1 with the largest page_size so admins can see the
        // ACTUAL unit total (page_count × page_size) — pre-fix the test
        // would just say "Connected" while sync silently returned only
        // the first 25 units.
        try {
            $response = \Illuminate\Support\Facades\Http::withoutRedirecting()->timeout(10)
                ->withHeaders(['Api-Key' => $key])->get("{$base}/apartments", ['page' => 1, 'page_size' => 50]);
            $code = $response->status();
            if ($code < 200 || $code >= 300) return response()->json(['success' => false, 'message' => "HTTP {$code}"]);

            $payload = $response->json() ?: [];
            $units   = is_array($payload['apartments'] ?? null) ? count($payload['apartments']) : 0;
            $total   = (int) ($payload['total_items'] ?? $units);
            $pages   = (int) ($payload['page_count'] ?? 1);

            return response()->json([
                'success' => true,
                'message' => $total > 0 ? "Connected · {$total} unit" . ($total === 1 ? '' : 's') . ' detected' : 'Connected · no units in Smoobu yet',
                'detail'  => [
                    'units_total' => $total,
                    'page_count'  => $pages,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    /**
     * Expo Push API smoke test. We don't need to actually send a push —
     * just verify the access token is well-formed and reaches Expo's
     * push-receipts endpoint without auth errors.
     */
    private function testExpoPush(): JsonResponse
    {
        $token = $this->resolveKey('expo_access_token', 'EXPO_ACCESS_TOKEN');
        if (!$token) return response()->json(['success' => false, 'message' => 'No access token configured']);

        // Expo accepts a POST to /push/getReceipts with an empty array
        // and returns 200 + { data: {} }. Any auth/format error returns
        // 4xx which is what we want to surface here.
        try {
            $ch = curl_init('https://exp.host/--/api/v2/push/getReceipts');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => json_encode(['ids' => []]),
                CURLOPT_HTTPHEADER     => [
                    "Authorization: Bearer {$token}",
                    'Content-Type: application/json',
                    'Accept-Encoding: gzip, deflate',
                ],
            ]);
            curl_exec($ch);
            $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($error) return response()->json(['success' => false, 'message' => "Connection failed: {$error}"]);
            return response()->json([
                'success' => $code >= 200 && $code < 300,
                'message' => $code >= 200 && $code < 300 ? 'Connected' : "HTTP {$code}",
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()]);
        }
    }

    /**
     * Send a real test email to the signed-in admin.
     *
     * This used to open a TCP socket to `mail_host` — and resolveKey() fell
     * back to the PLATFORM's MAIL_HOST, so an org that had configured nothing
     * got a green "SMTP reachable". The screen certified a configuration that
     * did not exist and would not have been used if it had.
     *
     * A test that does not exercise the real send path is worse than no test:
     * it converts "I do not know" into "confirmed working". So this sends an
     * actual message through the actual mailer, with the org's actual sender
     * identity, and reports what happened.
     */
    private function testMail(): JsonResponse
    {
        $user = request()->user();
        $to   = $user?->email;

        if (!$to) {
            return response()->json([
                'success' => false,
                'message' => 'No address to send to — your account has no email.',
            ]);
        }

        $orgId    = app()->bound('current_organization_id') ? (int) app('current_organization_id') : null;
        $identity = app(\App\Services\MailIdentityService::class)->forOrganization($orgId);

        try {
            \Illuminate\Support\Facades\Mail::html(
                '<p>This is a test email from your workspace.</p>'
                . '<p>If you received it, sending is working and this is how your '
                . 'name appears to recipients.</p>',
                function ($message) use ($to, $identity) {
                    $message->to($to)->subject('Test email from your workspace');
                    if ($identity['from_name']) {
                        $message->from($identity['from_address'], $identity['from_name']);
                    }
                    if ($identity['reply_to']) {
                        $message->replyTo($identity['reply_to']);
                    }
                },
            );
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Send failed: ' . $e->getMessage(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => "Test email sent to {$to} as \"" . ($identity['from_name'] ?: config('mail.from.name')) . '\". '
                . 'If it does not arrive within a few minutes, check your spam folder.',
            'sender'   => $identity['from_name'],
            'reply_to' => $identity['reply_to'],
        ]);
    }

    private function testStripe(): JsonResponse
    {
        // Per-tenant only — no env fallback. Each org configures its own
        // Stripe account so the "Test connection" button reflects whether
        // THIS org's keys work, not whether the platform has an env default.
        $key = HotelSetting::where('key', 'stripe_secret_key')->first()?->value;
        if (!$key) return response()->json(['success' => false, 'message' => 'No secret key configured for this organization']);

        $result = $this->curlTest('https://api.stripe.com/v1/balance', ["Authorization: Bearer {$key}"]);

        // Prevention follow-up to the Forrest Glamp restricted-key stuck-
        // refund situation: when the connection works AND the key is a
        // restricted `rk_live_*` / `rk_test_*` key, probe for the
        // refunds:write scope and surface a clear warning. Saves the
        // operator from finding out only when a refund first fails.
        if (($result['success'] ?? false) && $this->isRestrictedKeyByPrefix($key)) {
            try {
                $stripe = new \Stripe\StripeClient($key);
                $refundsWritable = $this->probeRefundsWriteAccess($stripe);
                if (!$refundsWritable) {
                    $result['warning'] = [
                        'code'    => 'refunds_write_missing',
                        'title'   => 'Restricted key cannot issue refunds',
                        'message' => 'Connection works, but this restricted key is missing the refunds:write scope. '
                            . 'Refunds via the admin Refund button will fail until you grant it. '
                            . 'Fix: open https://dashboard.stripe.com/apikeys → edit your key → enable refunds:write → save.',
                    ];
                }
            } catch (\Throwable $e) {
                // Best-effort probe — never let the warning logic
                // break the primary connection-test result.
                \Illuminate\Support\Facades\Log::info('Stripe refunds:write probe failed', [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json($result);
    }

    /**
     * `rk_live_*` and `rk_test_*` are restricted keys with per-resource
     * scope grants. `sk_live_*` / `sk_test_*` are unrestricted secrets.
     */
    private function isRestrictedKeyByPrefix(string $key): bool
    {
        return str_starts_with($key, 'rk_live_') || str_starts_with($key, 'rk_test_');
    }

    /**
     * Probe whether the key can write refunds. We attempt to refund a
     * bogus PI id — Stripe responds with InvalidRequestException
     * "No such payment_intent" when the scope is granted (the call got
     * far enough to look up the resource), and with a permission-style
     * error when the scope is missing. Same pattern the
     * `stripe:check-key-permissions` artisan command uses.
     */
    private function probeRefundsWriteAccess(\Stripe\StripeClient $stripe): bool
    {
        try {
            $stripe->refunds->create(['payment_intent' => 'pi_diag_probe_invalid']);
            // Won't normally reach here.
            return true;
        } catch (\Throwable $e) {
            $missingScope = \App\Services\StripeService::isRestrictedKeyPermissionError($e);
            if ($missingScope) {
                return false;
            }
            if ($e instanceof \Stripe\Exception\InvalidRequestException) {
                // Got far enough to look up the (non-existent) PI →
                // the scope IS granted.
                return true;
            }
            // Inconclusive (auth error, network glitch, etc.) — treat
            // as "can't confirm missing" so we don't false-positive.
            return true;
        }
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
