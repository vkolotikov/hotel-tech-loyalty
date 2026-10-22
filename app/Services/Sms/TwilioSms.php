<?php

namespace App\Services\Sms;

use App\Models\HotelSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sending an SMS through the VENUE's own Twilio account (HexaTech Loyalty release 4, owner decision R4-4): the Account
 * SID, Auth Token and phone number a super admin enters in the full admin's Settings → Integrations
 * (`twilio_account_sid`, `twilio_auth_token`, `twilio_phone_number`, hotel_settings rows of the organisation).
 *
 * Only the organisation's own rows count. SettingsController falls back to the platform's TWILIO_* environment values
 * when a row is empty; this does not, as for Stripe: a venue that set nothing must never send, and be billed, through
 * the platform's account. The rows are read directly (as StripeService reads its keys), never through the settings
 * cache, so the token never lands in a cache store from here and a key moved into HotelSetting::ENCRYPTED_KEYS later
 * still reads in the clear here. The Auth Token is used for the request's basic authentication and nowhere else: it is
 * never answered, logged or audited.
 *
 * The sender may be a phone number in E.164 (`From`), a Messaging Service SID (`MG…`, `MessagingServiceSid`) or an
 * alphanumeric sender ID where the country allows one (1–11 letters, digits and spaces, `From`).
 */
class TwilioSms
{
    public const KEYS = ['account_sid' => 'twilio_account_sid', 'auth_token' => 'twilio_auth_token', 'phone_number' => 'twilio_phone_number'];

    private const API = 'https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json';

    /**
     * What an Account SID and a Messaging Service SID look like: `AC` or `MG` and letters and digits. Only the shape is
     * checked here, to catch a value pasted into the wrong field; whether the account exists is Twilio's to say.
     */
    private const ACCOUNT_SID = '/^AC[0-9A-Za-z]{10,64}$/';
    private const SERVICE_SID = '/^MG[0-9A-Za-z]{10,64}$/';

    /** Twilio's error code for a number that replied STOP: it will not take messages to it until the member replies START. */
    public const UNSUBSCRIBED = 21610;

    /**
     * Whether the venue can send, and what is missing or wrong (by setting: `account_sid`, `auth_token`,
     * `phone_number`). `from` is the sender as members see it; never the SID or the token.
     *
     * @return array{ready: bool, missing: list<string>, wrong: list<string>, from: ?string}
     */
    public function readiness(int $orgId): array
    {
        $values = $this->settings($orgId);
        $missing = array_values(array_keys(array_filter($values, fn (string $v) => $v === '')));
        $wrong = [];
        if ($values['account_sid'] !== '' && preg_match(self::ACCOUNT_SID, $values['account_sid']) !== 1) {
            $wrong[] = 'account_sid';
        }
        if ($values['phone_number'] !== '' && self::sender($values['phone_number']) === null) {
            $wrong[] = 'phone_number';
        }

        return [
            'ready'   => $missing === [] && $wrong === [],
            'missing' => $missing,
            'wrong'   => $wrong,
            'from'    => $values['phone_number'] !== '' && self::sender($values['phone_number']) !== null ? self::sender($values['phone_number'])[1] : null,
        ];
    }

    /**
     * Hand one SMS to Twilio. Nothing is thrown.
     *
     * @return array{ok: bool, sid: ?string, segments: ?int, error: ?string, retry: bool, stop: bool}
     *   `error`: `twilio_<code>` (Twilio's own error code), `http_<status>`, `unreachable`, or `not_ready` (the
     *   settings are missing or wrong); `retry`: Twilio refused it for now (429) and took nothing, so it may be sent
     *   again later; `stop`: the account refused the credentials or is not set up, so nothing else will go either.
     */
    public function send(int $orgId, string $to, string $body): array
    {
        $out = fn (array $r) => $r + ['ok' => false, 'sid' => null, 'segments' => null, 'error' => null, 'retry' => false, 'stop' => false];
        $values = $this->settings($orgId);
        $sender = self::sender($values['phone_number']);
        if ($values['account_sid'] === '' || $values['auth_token'] === '' || $sender === null
            || preg_match(self::ACCOUNT_SID, $values['account_sid']) !== 1) {
            return $out(['error' => 'not_ready', 'stop' => true]);
        }

        try {
            $response = Http::asForm()
                ->withBasicAuth($values['account_sid'], $values['auth_token'])
                ->acceptJson()
                ->timeout(20)
                ->post(sprintf(self::API, $values['account_sid']), ['To' => $to, 'Body' => $body, $sender[0] => $sender[1]]);
        } catch (\Throwable $e) {
            // The exception's class only: its message may carry the request's address, never wanted in a log.
            Log::warning('Twilio SMS request failed', ['organization_id' => $orgId, 'error' => class_basename($e)]);

            return $out(['error' => 'unreachable']);
        }

        if ($response->successful()) {
            $segments = $response->json('num_segments');

            return $out([
                'ok'       => true,
                'sid'      => is_string($response->json('sid')) ? mb_substr($response->json('sid'), 0, 64) : null,
                'segments' => is_numeric($segments) ? max(0, min(65535, (int) $segments)) : null,
            ]);
        }

        $status = $response->status();
        $code = $response->json('code');

        return $out([
            'error' => is_numeric($code) ? 'twilio_' . (int) $code : 'http_' . $status,
            'retry' => $status === 429,
            'stop'  => in_array($status, [401, 403], true) || (is_numeric($code) && in_array((int) $code, [20003, 20005], true)),
        ]);
    }

    /** Whether a Twilio error code says the member's number replied STOP. */
    public static function unsubscribed(?string $error): bool
    {
        return $error === 'twilio_' . self::UNSUBSCRIBED;
    }

    /**
     * The request's sender parameter and value for a stored sender: an E.164 number, a Messaging Service SID or an
     * alphanumeric sender ID; null for anything else.
     *
     * @return array{0: string, 1: string}|null
     */
    public static function sender(string $stored): ?array
    {
        $value = trim($stored);
        if (preg_match(self::SERVICE_SID, $value) === 1) {
            return ['MessagingServiceSid', $value];
        }
        $number = PhoneNumber::e164($value);
        if ($number !== null) {
            return ['From', $number];
        }
        if (preg_match('/^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/', $value) === 1) {
            return ['From', $value];
        }

        return null;
    }

    /** @return array{account_sid: string, auth_token: string, phone_number: string} the organisation's own rows, trimmed */
    private function settings(int $orgId): array
    {
        $rows = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('key', array_values(self::KEYS))
            ->get();
        $out = [];
        foreach (self::KEYS as $name => $key) {
            $row = $rows->firstWhere('key', $key);
            $out[$name] = trim((string) ($row?->value ?? ''));
        }

        return $out;
    }
}
