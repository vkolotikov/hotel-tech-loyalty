<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Sms\TwilioSms;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * PUT /v1/admin/loyalty/sms/connection — the venue's own Twilio account, set from HexaTech Loyalty (2026-11-02), so an
 * organisation on modules (which has no full admin) can send SMS campaigns. The same hotel_settings rows the full
 * admin's Settings → Integrations writes (TwilioSms::KEYS); HotelSetting encrypts the Auth Token at rest. An empty
 * token keeps the stored one. The token is never answered, logged or audited: the answer is TwilioSms::readiness().
 * Behind the SMS routes' `campaigns` feature; managers only.
 */
class SmsConnectionController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $validated = $request->validate([
            'account_sid'  => ['required', 'string', 'max:64', 'regex:' . TwilioSms::ACCOUNT_SID],
            'auth_token'   => ['nullable', 'string', 'max:128'],
            'phone_number' => ['required', 'string', 'max:64'],
        ]);
        $phone = trim($validated['phone_number']);
        if (TwilioSms::sender($phone) === null) {
            return response()->json([
                'error' => 'wrong_sender',
                'message' => 'Enter the number SMS are sent from with + and the country code, or a Messaging Service SID.',
                'errors' => ['phone_number' => ['wrong_sender']],
            ], 422);
        }
        $orgId = (int) app('current_organization_id');
        $values = ['account_sid' => trim($validated['account_sid']), 'phone_number' => $phone];
        $token = trim((string) ($validated['auth_token'] ?? ''));
        if ($token !== '') {
            $values['auth_token'] = $token;
        } elseif (!$this->stored($orgId, TwilioSms::KEYS['auth_token'])) {
            return response()->json(['error' => 'token_required', 'message' => 'Enter the Auth Token.', 'errors' => ['auth_token' => ['required']]], 422);
        }

        $labels = ['account_sid' => 'Twilio Account SID', 'auth_token' => 'Twilio Auth Token', 'phone_number' => 'Twilio Phone Number'];
        foreach ($values as $name => $value) {
            $row = HotelSetting::firstOrNew(['key' => TwilioSms::KEYS[$name]]);
            $row->forceFill(['organization_id' => $orgId, 'type' => 'string', 'group' => 'integrations', 'label' => $labels[$name]]);
            $row->value = $value;
            $row->save();
        }
        // Names only: never a value.
        AuditLog::record('sms_connection_saved', null, ['settings' => array_keys($values)], [], $request->user(), 'Twilio account set in HexaTech Loyalty');

        return response()->json(['twilio' => app(TwilioSms::class)->readiness($orgId)]);
    }

    /** This organisation's own row (TenantScope). */
    private function stored(int $orgId, string $key): bool
    {
        $row = HotelSetting::where('key', $key)->first();

        return trim((string) ($row?->value ?? '')) !== '';
    }
}
