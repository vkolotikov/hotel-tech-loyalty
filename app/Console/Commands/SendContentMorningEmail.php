<?php

namespace App\Console\Commands;

use App\Mail\ContentMorningEmail;
use App\Models\Organization;
use App\Models\Staff;
use App\Models\User;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentMorningDigest;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * HexaTech Content's morning email (spec 2026-10-19 §4.5), the loyalty digest's pattern: scheduled hourly; for each
 * opted-in staff member with an email and an active staff row, in an organisation that has Content, it sends at the
 * venue's 8 am (the clock Content's "today" uses), at most once a venue day, and only when there is something to say.
 *
 * `--force` skips the hour and once-a-day checks; `--hour=N` changes the hour; `--user=ID` targets one person.
 */
class SendContentMorningEmail extends Command
{
    protected $signature = 'content:send-morning-email
                            {--hour=8 : Venue hour to send at (0-23)}
                            {--user= : Send to one user id (testing)}
                            {--force : Skip the hour and once-a-day checks (testing)}';

    protected $description = "Send HexaTech Content's morning email to opted-in staff whose venue is at the send hour.";

    public function handle(): int
    {
        $hour = (int) $this->option('hour');
        if ($hour < 0 || $hour > 23) {
            $this->error('Invalid --hour, must be 0-23');

            return self::FAILURE;
        }
        $force = (bool) $this->option('force');
        $query = User::query()->where('user_type', 'staff')->where('wants_content_morning_email', true)->whereNotNull('email')
            ->when($this->option('user'), fn ($q, $id) => $q->where('id', $id));
        $sent = 0;
        $skipped = 0;
        $failed = 0;

        $query->chunkById(100, function ($users) use (&$sent, &$skipped, &$failed, $hour, $force) {
            foreach ($users as $user) {
                $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
                try {
                    $this->sendTo($user, $hour, $force) ? $sent++ : $skipped++;
                } catch (\Throwable $e) {
                    $failed++;
                    Log::warning("Content morning email failed for user {$user->id}: " . $e->getMessage());
                } finally {
                    $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
                }
            }
        });

        $this->info("Content morning email run: sent={$sent} skipped={$skipped} failed={$failed}");

        return self::SUCCESS;
    }

    /** True when the email was queued. */
    private function sendTo(User $user, int $hour, bool $force): bool
    {
        $org = Organization::withoutGlobalScopes()->find($user->organization_id);
        if (!$org || !$org->workspaceEnabled('content') || $org->appointmentsOnly()) {
            return false;
        }
        // Staff, brands, profiles and posts are tenant-scoped: read under the person's organisation.
        app()->instance('current_organization_id', (int) $org->id);
        if (!Staff::where('user_id', $user->id)->where('is_active', true)->exists()) {
            return false;
        }
        $venueNow = VenueClock::now((int) $org->id);
        if (!$force && (int) $venueNow->format('G') !== $hour) {
            return false;
        }
        $last = $user->content_morning_email_last_sent_at;
        if (!$force && $last !== null
            && $last->copy()->setTimezone(VenueClock::zone((int) $org->id))->format('Y-m-d') === $venueNow->format('Y-m-d')) {
            return false;
        }
        $lines = ContentMorningDigest::build($user, (int) $org->id, $venueNow);
        if ($lines === null) {
            return false;
        }
        Mail::to($user->email, $user->name ?: null)->queue(new ContentMorningEmail($lines));
        $user->forceFill(['content_morning_email_last_sent_at' => now()])->save();

        return true;
    }
}
