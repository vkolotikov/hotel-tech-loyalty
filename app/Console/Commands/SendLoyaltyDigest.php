<?php

namespace App\Console\Commands;

use App\Mail\LoyaltyDigest;
use App\Models\Organization;
use App\Models\User;
use App\Services\LoyaltyDigestService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Daily loyalty digest cron — mirrors the engagement-summary pattern.
 *
 * Scheduled hourly. For each opted-in admin (users.wants_loyalty_digest
 * = true):
 *   - check whether their org's local clock is at the SEND_HOUR
 *   - check whether they've already received yesterday's digest
 *   - if both pass: build summary, send, stamp the dedupe column
 *
 * Hourly + per-org-timezone gate gives every customer an 8am send
 * regardless of where they are. The dedupe column makes the cron
 * idempotent within an hour.
 *
 * `--force` bypasses both checks; `--hour=N` (0-23) overrides the
 * send hour; `--user=ID` targets one user — all for testing.
 */
class SendLoyaltyDigest extends Command
{
    protected $signature = 'loyalty:send-digest
                            {--hour=8 : Local hour to send at (0-23)}
                            {--user= : Send to a single user id (testing)}
                            {--force : Skip the dedupe + hour checks (testing)}';

    protected $description = 'Send the daily loyalty digest email to opted-in admins whose org is currently at the local send-hour.';

    public function handle(LoyaltyDigestService $service): int
    {
        $sendHour = (int) $this->option('hour');
        if ($sendHour < 0 || $sendHour > 23) {
            $this->error('Invalid --hour, must be 0-23');
            return self::FAILURE;
        }

        $userIdFilter = $this->option('user');
        $force = (bool) $this->option('force');

        $query = User::withoutGlobalScopes()
            ->where('user_type', 'staff')
            ->where('wants_loyalty_digest', true)
            ->whereNotNull('email');

        if ($userIdFilter) {
            $query->where('id', $userIdFilter);
        }

        $sent = 0;
        $skipped = 0;
        $failed = 0;

        $query->chunkById(100, function ($users) use (&$sent, &$skipped, &$failed, $service, $sendHour, $force) {
            foreach ($users as $user) {
                $org = Organization::withoutGlobalScopes()->find($user->organization_id);
                if (!$org) { $skipped++; continue; }

                $orgNow = $service->orgNow($org);

                if (!$force && $orgNow->hour !== $sendHour) {
                    $skipped++;
                    continue;
                }

                if (!$force && $user->loyalty_digest_last_sent_at
                    && $user->loyalty_digest_last_sent_at->copy()->setTimezone($orgNow->timezoneName)->isSameDay($orgNow)) {
                    $skipped++;
                    continue;
                }

                try {
                    // Bind org context so the analytics service's
                    // tier-movement query (which uses tenant scope) and
                    // any other org-bound reads return data for the
                    // right tenant.
                    app()->instance('current_organization_id', $org->id);

                    $payload = $service->buildSummary($org->id, $orgNow);
                    Mail::to($user->email, $user->name ?? null)
                        ->send(new LoyaltyDigest($payload, $user->name ?? ''));

                    $user->forceFill(['loyalty_digest_last_sent_at' => now()])->save();
                    $sent++;
                    $this->info(sprintf('  ✓ sent to %s (org #%d, %s)', $user->email, $org->id, $orgNow->timezoneName));
                } catch (\Throwable $e) {
                    $failed++;
                    Log::warning('Loyalty digest send failed for user ' . $user->id . ': ' . $e->getMessage());
                    $this->warn(sprintf('  ✗ failed for %s: %s', $user->email, $e->getMessage()));
                }
            }
        });

        $this->info("Loyalty digest run: sent={$sent} skipped={$skipped} failed={$failed}");
        return self::SUCCESS;
    }
}
