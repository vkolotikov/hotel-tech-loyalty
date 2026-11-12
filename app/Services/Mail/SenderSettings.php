<?php

namespace App\Services\Mail;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\User;
use App\Services\MailIdentityService;
use App\Support\SettingRegistry;

/**
 * The venue's sender identity as a setting (round 5, 2026-11-12): the two keys MailIdentityService reads — the name on
 * the envelope (`mail_from_name`) and where replies go (`mail_reply_to`) — and nothing else. The From ADDRESS stays the
 * platform's on purpose (DMARC alignment; see MailIdentityService).
 *
 * The full admin writes these two through Settings → Integrations → "Email sender" (SettingsController::update);
 * HexaTech CRM through `admin/crm/mail-settings`, here. Both keep the same rules: the keys sit in the `integrations`
 * group, which SettingRegistry::ownerOnly() gives to an owner (an active `super_admin`) — the CRM asks the same
 * question — and every change is audited `setting_updated` with its old and new value, as SettingsController does.
 */
final class SenderSettings
{
    public const KEYS = [MailIdentityService::KEY_FROM_NAME, MailIdentityService::KEY_REPLY_TO];

    public const NAME_MAX = 100;

    /**
     * What is set, what each falls back to, and what an email will carry now.
     *
     * @return array{from_name: ?string, reply_to: ?string, defaults: array{from_name: ?string, reply_to: ?string}, identity: array{from_name: ?string, from_address: string, reply_to: ?string}}
     */
    public function read(Organization $org): array
    {
        $stored = HotelSetting::withoutGlobalScopes()->where('organization_id', $org->id)->whereIn('key', self::KEYS)
            ->pluck('value', 'key');
        $value = fn (string $key): ?string => is_string($stored[$key] ?? null) && trim($stored[$key]) !== '' ? trim($stored[$key]) : null;

        return [
            'from_name' => $value(MailIdentityService::KEY_FROM_NAME),
            'reply_to'  => $value(MailIdentityService::KEY_REPLY_TO),
            'defaults'  => [
                'from_name' => $org->name ?: null,
                'reply_to'  => $org->email && filter_var($org->email, FILTER_VALIDATE_EMAIL) ? (string) $org->email : null,
            ],
            // A fresh resolver: the shared one keeps each organisation's identity for the rest of the request.
            'identity'  => (new MailIdentityService())->forOrganization((int) $org->id),
        ];
    }

    /** Whether this person may change the sender: the full admin's rule for these keys (SettingsController::update). */
    public static function mayChange(?User $user): bool
    {
        $owner = static function () use ($user): bool {
            $staff = $user?->staff;

            return $staff !== null && $staff->role === 'super_admin' && (bool) $staff->is_active;
        };
        foreach (self::KEYS as $key) {
            if (SettingRegistry::ownerOnly($key) && !$owner()) {
                return false;
            }
        }

        return $user !== null;
    }

    /**
     * Save the two values (an empty one clears it, so the default applies); unchanged ones write nothing. Each change is
     * audited as the full admin's settings save audits it.
     *
     * @param  array{from_name: ?string, reply_to: ?string}  $values
     */
    public function save(Organization $org, User $user, array $values): void
    {
        $byKey = [
            MailIdentityService::KEY_FROM_NAME => trim((string) ($values['from_name'] ?? '')),
            MailIdentityService::KEY_REPLY_TO  => strtolower(trim((string) ($values['reply_to'] ?? ''))),
        ];
        foreach ($byKey as $key => $new) {
            $definition = SettingRegistry::get($key);
            $setting = HotelSetting::withoutGlobalScopes()->where('organization_id', $org->id)->where('key', $key)->first();
            $old = $setting?->value;
            if ((string) $old === $new) {
                continue;
            }
            $attributes = ['value' => $new, 'group' => $definition['group'] ?? 'integrations', 'scope' => $definition['scope'] ?? 'company', 'type' => $definition['type'] ?? 'string'];
            if ($setting) {
                $setting->update($attributes);
            } else {
                $setting = new HotelSetting($attributes + ['key' => $key, 'label' => $definition['label'] ?? $key]);
                $setting->organization_id = (int) $org->id;
                $setting->save();
            }
            AuditLog::record('setting_updated', $setting, ['value' => $new], ['value' => $old], $user, "Setting '{$key}' changed");
        }
    }
}
