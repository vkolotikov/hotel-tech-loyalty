<?php

namespace App\Console\Commands;

use App\Mail\EngagementDailySummary;
use App\Models\Organization;
use App\Models\User;
use App\Services\EngagementDailySummaryService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Engagement Hub Phase 4 v3 — daily summary cron.
 *
 * Scheduled hourly. For each opted-in staff user:
 *   - check whether their org's local clock is in the SEND_HOUR window
 *   - check whether they've already received yesterday's summary
 *   - if both pass: build summary, send mail, stamp `daily_summary_last_sent_at`
 *
 * Hourly + per-org-timezone is the simplest pattern that gives every
 * org an 8am send regardless of where they are. The dedupe column on
 * the user makes the cron idempotent — running it twice in the same
 * hour can't double-send.
 *
 * Override the send hour via `--hour=N` for testing (1-23). Without
 * the flag, the default is 8 (local).
 */
class SendEngagementDailySummary extends Command
{
    protected $signature = 'engagement:send-daily-summary
                            {--hour=8 : Local hour to send at (0-23)}
                            {--user= : Send to a single user id (testing)}
                            {--force : Skip the dedupe check (testing)}';

    protected $description = 'Send the Engagement Hub daily summary email to opted-in admins whose org is currently at the local send-hour.';

    public function handle(EngagementDailySummaryService $service): int
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
            ->where('wants_daily_summary', true)
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

                // Time gate: only send when the org's local clock matches the
                // configured hour. Hourly cron means we hit this branch once
                // per day per org. The --force flag bypasses for testing.
                if (!$force && $orgNow->hour !== $sendHour) {
                    $skipped++;
                    continue;
                }

                // Dedupe: already-sent today (in the org's timezone) gets a
                // skip even if the hour matches.
                if (!$force && $user->daily_summary_last_sent_at
                    && $user->daily_summary_last_sent_at->copy()->setTimezone($orgNow->timezoneName)->isSameDay($orgNow)) {
                    $skipped++;
                    continue;
                }

                try {
                    // Bind the org context so any tenant-scoped queries inside
                    // buildSummary still work — though the service uses
                    // withoutGlobalScopes for safety, this keeps things
                    // consistent with the rest of the codebase's tenant model.
                    app()->instance('current_organization_id', $org->id);

                    $payload = $service->buildSummary($org->id, $orgNow);
                    Mail::to($user->email, $user->name ?? null)
                        ->send(new EngagementDailySummary($payload, $user->name ?? ''));

                    $user->forceFill(['daily_summary_last_sent_at' => now()])->save();
                    $sent++;
                    $this->info(sprintf('  ✓ sent to %s (org #%d, %s)', $user->email, $org->id, $orgNow->timezoneName));
                } catch (\Throwable $e) {
                    $failed++;
                    Log::warning('Daily summary send failed for user ' . $user->id . ': ' . $e->getMessage());
                    $this->warn(sprintf('  ✗ failed for %s: %s', $user->email, $e->getMessage()));
                }
            }
        });

        $this->info("Daily summary run: sent={$sent} skipped={$skipped} failed={$failed}");
        return self::SUCCESS;
    }
}
