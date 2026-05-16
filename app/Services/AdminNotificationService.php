<?php

namespace App\Services;

use App\Models\HotelSetting;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

/**
 * Resolves the list of admin email recipients for a given org and
 * dispatches admin-only notifications.
 *
 * Resolution order:
 *   1. hotel_settings.admin_notification_emails (comma-separated) —
 *      the explicit allowlist staff can configure in Settings.
 *   2. Fallback: every staff user on the org with a non-empty email.
 *
 * Every send is wrapped in try/catch so a transient SMTP failure can't
 * 500 a successful booking — the guest path is what matters.
 */
class AdminNotificationService
{
    /**
     * Resolve the unique list of admin email addresses for an org.
     */
    public function resolveRecipients(?int $orgId): array
    {
        if (!$orgId) return [];

        $configured = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'admin_notification_emails')
            ->value('value');

        $emails = [];
        if ($configured) {
            foreach (preg_split('/[\s,;]+/', $configured) as $e) {
                $e = strtolower(trim($e));
                if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) {
                    $emails[] = $e;
                }
            }
        }

        // Fallback to all staff if nothing's explicitly configured.
        if (empty($emails)) {
            $emails = User::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('user_type', 'staff')
                ->whereNotNull('email')
                ->where('email', '!=', '')
                ->pluck('email')
                ->map(fn ($e) => strtolower(trim($e)))
                ->filter(fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL))
                ->unique()
                ->values()
                ->all();
        }

        return $emails;
    }

    /**
     * Send a mailable to every admin recipient for an org. Returns the
     * count of attempted sends.
     */
    public function send(?int $orgId, \Illuminate\Mail\Mailable $mailable): int
    {
        $emails = $this->resolveRecipients($orgId);
        if (empty($emails)) {
            return 0;
        }
        try {
            // Queue rather than send: with queue=redis/database, admin
            // notifications survive a transient SMTP failure (the
            // worker retries) and don't block the guest's confirm()
            // response while a slow mailer churns through them.
            Mail::to($emails)->queue($mailable);
            return count($emails);
        } catch (\Throwable $e) {
            Log::warning('Admin notification send failed', [
                'org_id'     => $orgId,
                'recipients' => $emails,
                'error'      => $e->getMessage(),
            ]);
            return 0;
        }
    }
}
