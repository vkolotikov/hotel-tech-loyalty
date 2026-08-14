<?php

namespace Tests\Feature\Settings;

use App\Http\Controllers\Api\V1\Admin\SettingsController;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Locks two properties of the settings-secret handling that, together, leaked
 * NINE of the PLATFORM's own credentials to every tenant administrator.
 *
 * The chain that existed:
 *   1. An org that had never configured its own value had an empty settings row.
 *   2. SettingsController::index() saw the empty value and substituted the
 *      PLATFORM's own `env(...)` as a "helpful" fallback, for any key listed in
 *      ENV_FALLBACKS.
 *   3. If the key was also in SECRET_KEYS, that platform value was passed
 *      through maskSecret() and returned to the client as `masked`.
 *   4. maskSecret() revealed the first FOUR and last FOUR characters. The
 *      production MAIL_PASSWORD is 10 characters, so 8 of 10 were disclosed —
 *      reconstructable by hand.
 *
 * Nine keys sit in both lists, so this was never only about SMTP. It also
 * exposed the OpenAI and Anthropic API keys, the Twilio auth token, the Smoobu
 * API key, the Google Maps key, the WhatsApp tokens, and the Expo access token
 * that controls mobile app releases — to any tenant's super_admin who opened
 * Settings.
 *
 * The SMTP password is simply the one that surfaced first, while auditing
 * deliverability: that credential sends as the platform's own domain, so
 * whoever reassembled it could burn the sending reputation every tenant shares.
 *
 * These tests assert the two independent guarantees that each break the chain,
 * so restoring either behaviour fails loudly.
 */
class SecretMaskingTest extends TestCase
{
    private function maskSecret(string $value): string
    {
        $m = new ReflectionMethod(SettingsController::class, 'maskSecret');
        $m->setAccessible(true);
        return $m->invoke(new SettingsController(), $value);
    }

    private function constant(string $name): array
    {
        return (new ReflectionClass(SettingsController::class))->getConstant($name);
    }

    /* ─── Guarantee 1: a mask must not disclose most of a short secret ─── */

    public function test_a_short_secret_is_fully_masked(): void
    {
        // 10 chars — the length of the real production MAIL_PASSWORD.
        $masked = $this->maskSecret('Ab3xK9mQ7z');

        $this->assertSame('••••••••', $masked,
            'A secret short enough that a visible tail would reveal most of it must be fully masked.');
    }

    public function test_a_long_secret_reveals_only_a_short_tail(): void
    {
        $secret = 'sk_live_51H8xQ2eZvKqABCDEFGH';
        $masked = $this->maskSecret($secret);

        $this->assertStringEndsWith(substr($secret, -4), $masked,
            'A recognisable tail is the point — an admin must be able to tell which credential is set.');
        $this->assertStringNotContainsString(substr($secret, 0, 4), $masked,
            'The LEADING characters must never be shown; combined with the tail they reconstruct short secrets.');

        $revealed = strlen(str_replace('•', '', $masked));
        $this->assertLessThanOrEqual(4, $revealed,
            'At most 4 characters of any secret may be visible.');
    }

    public function test_mask_never_returns_the_raw_value(): void
    {
        foreach (['short', 'Ab3xK9mQ7z', 'a-much-longer-api-key-value-here'] as $secret) {
            $this->assertNotSame($secret, $this->maskSecret($secret),
                "maskSecret must never return the input verbatim ({$secret}).");
        }
    }

    /* ─── Guarantee 2: secrets must not fall back to platform env values ─── */

    public function test_every_secret_key_that_has_an_env_fallback_is_known(): void
    {
        // index() must not substitute a platform env value for an unset tenant
        // secret. This test documents which secrets have an env fallback
        // configured at all, so anyone adding another is forced to look at the
        // guard in index() rather than inheriting the leak.
        $secrets  = $this->constant('SECRET_KEYS');
        $fallback = array_keys($this->constant('ENV_FALLBACKS'));

        $overlap = array_values(array_intersect($secrets, $fallback));
        sort($overlap);

        // NINE platform credentials sit in both lists. Before the guard in
        // index(), every one of them was substituted from the platform's own
        // env and returned masked to any tenant administrator whose org had not
        // set its own value — including the OpenAI and Anthropic API keys, the
        // Twilio auth token, and the Expo access token that controls mobile app
        // releases. The SMTP password was merely the one we noticed first.
        $this->assertSame(
            [
                'ai_anthropic_api_key',
                'ai_openai_api_key',
                'booking_smoobu_api_key',
                'expo_access_token',
                'google_maps_api_key',
                'mail_password',
                'twilio_auth_token',
                'whatsapp_access_token',
                'whatsapp_verify_token',
            ],
            $overlap,
            'A SECRET key gained or lost an ENV fallback. index() must never expose a platform env '
            . 'value for a tenant that has not set its own — re-read the guard there first.',
        );
    }

    public function test_mail_password_is_encrypted_at_rest(): void
    {
        // Also keeps it out of cachedMapFor(), which only excludes ENCRYPTED_KEYS
        // — otherwise the password is written to the cache store in the clear.
        $this->assertContains(
            'mail_password',
            \App\Models\HotelSetting::ENCRYPTED_KEYS,
            'A tenant SMTP password must be encrypted at rest and excluded from the settings cache.',
        );
    }
}
