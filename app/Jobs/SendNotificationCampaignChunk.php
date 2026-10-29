<?php

namespace App\Jobs;

use App\Models\CampaignRecipient;
use App\Models\EmailTemplate;
use App\Models\LoyaltyMember;
use App\Models\NotificationCampaign;
use App\Models\Organization;
use App\Services\EmailComplianceService;
use App\Services\MailIdentityService;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Send one slice of a push/email campaign, then queue the next.
 *
 * WHY THIS EXISTS
 * NotificationController::createCampaign used to do all of this inline, in the
 * HTTP request: a foreach over EVERY matching member, one SMTP round-trip each,
 * no chunking and no pacing. Two consequences, both bad.
 *
 * For the admin: a campaign to a few thousand members outlives any sane request
 * timeout, so they get a 504 having no idea how many messages went out — and
 * because the counters were only written after the loop, the campaign row still
 * said "sending" forever.
 *
 * For the platform: handing a shared relay several thousand messages at once is
 * exactly how a sender reputation gets destroyed, and this platform sends every
 * tenant's mail from one domain.
 *
 * This mirrors SendEmailCampaignChunk deliberately. The two campaign TYPES stay
 * separate — NotificationCampaign is templated push+email with per-recipient
 * tracking, EmailCampaign is plain broadcast email — but they now share one
 * sending discipline, so the next pacing or compliance fix has to be made once
 * rather than remembered twice.
 *
 * Tenant context is re-bound by hand: a queued job runs outside the request
 * that created it, TenantMiddleware never fires, and every scoped query would
 * otherwise fail closed and silently match nobody.
 */
class SendNotificationCampaignChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Recipients per job. Matches SendEmailCampaignChunk. */
    public const CHUNK = 100;

    public int $tries = 3;
    public int $timeout = 300;

    public function __construct(
        public int $campaignId,
        public array $memberIds,
        public int $offset = 0,
    ) {
    }

    public function handle(
        EmailComplianceService $compliance,
        NotificationService $notifications,
        MailIdentityService $identityService,
    ): void {
        $campaign = NotificationCampaign::withoutGlobalScopes()->find($this->campaignId);

        if (!$campaign || $campaign->status !== 'sending') {
            return; // deleted mid-flight
        }

        // Without this every scoped read below returns nothing.
        app()->instance('current_organization_id', (int) $campaign->organization_id);

        $slice = array_slice($this->memberIds, $this->offset, self::CHUNK);

        if ($slice === []) {
            $this->finish($campaign);
            return;
        }

        // Hourly budget check. Chunk spacing paces ONE campaign; this bounds
        // the total, which is the only number the provider sees. Over budget
        // means LATER, never dropped — a campaign that finishes an hour late is
        // a non-event, a campaign that silently skipped 400 people is a support
        // incident nobody can reconstruct.
        $limiter = app(\App\Services\CampaignRateLimiter::class);
        $sendEmail = in_array($campaign->channel, ['email', 'both'], true);
        $sendPush  = in_array($campaign->channel, ['push', 'both'], true);
        $reservation = $sendEmail ? $limiter->reserve($campaign->organization_id, count($slice)) : null;
        $allowance = $reservation['count'] ?? count($slice);
        if ($allowance < 1) {
            \Illuminate\Support\Facades\Log::info('campaign chunk deferred: hourly send budget exhausted', [
                'campaign_id'     => $campaign->id,
                'organization_id' => $campaign->organization_id,
                'offset'          => $this->offset,
            ]);

            // Re-queue THIS chunk (same offset) at the top of the next hour.
            self::dispatch($this->campaignId, $this->memberIds, $this->offset)
                ->delay(now()->addMinutes(max(1, 60 - (int) now()->format('i'))));

            return;
        }

        $slice = array_slice($slice, 0, $allowance);
        $unused = $allowance;

        $template = $campaign->email_template_id
            ? EmailTemplate::withoutGlobalScopes()->find($campaign->email_template_id)
            : null;

        $org      = Organization::withoutGlobalScopes()->find($campaign->organization_id);
        $identity = $identityService->forOrganization($campaign->organization_id);
        $orgName  = $identity['from_name'] ?: $org?->name;

        $members = LoyaltyMember::whereIn('id', $slice)->with(['user', 'tier'])->get();

        foreach ($members as $member) {
            if ($sendPush && $member->expo_push_token) {
                $this->sendPush($campaign, $member, $notifications);
            }

            if ($sendEmail && $template) {
                $attempted = false;
                $this->sendEmail(
                    $campaign, $member, $template, $compliance, $identity, $orgName, $org, $attempted,
                );
                $unused -= $attempted ? 1 : 0;
            }
        }

        // Only EMAIL consumes the mail budget; push goes to Expo, not the relay.
        if ($reservation) {
            $limiter->release($reservation['id'], $unused);
        }

        // Each recipient's status and counter commit together in settle().

        $nextOffset = $this->offset + count($slice);

        if ($nextOffset >= count($this->memberIds)) {
            $this->finish($campaign);
            return;
        }

        // Same pacing knob as the other campaign path.
        $spacing = max(1, (int) config('mail.campaign_chunk_seconds', 60));

        self::dispatch($this->campaignId, $this->memberIds, $nextOffset)
            ->delay(now()->addSeconds($spacing));
    }

    private function finish(NotificationCampaign $campaign): void
    {
        NotificationCampaign::withoutGlobalScopes()->whereKey($campaign->id)->where('status', 'sending')->update([
            'status'  => 'sent',
            'sent_at' => now(),
        ]);
    }

    /** Historical rows remain intact; the campaign lock serializes claims without requiring a new unique index. */
    private function claim(NotificationCampaign $campaign, LoyaltyMember $member, string $channel, ?string $email = null): ?CampaignRecipient
    {
        return DB::transaction(function () use ($campaign, $member, $channel, $email) {
            $locked = NotificationCampaign::withoutGlobalScopes()->where('organization_id', $campaign->organization_id)
                ->whereKey($campaign->id)->lockForUpdate()->first();
            if (!$locked || $locked->status !== 'sending' || (int) $member->organization_id !== (int) $locked->organization_id) return null;
            if (CampaignRecipient::withoutGlobalScopes()->where('organization_id', $locked->organization_id)
                ->where('campaign_id', $locked->id)->where('loyalty_member_id', $member->id)->where('channel', $channel)->exists()) return null;

            return CampaignRecipient::create([
                'organization_id' => $locked->organization_id, 'campaign_id' => $locked->id,
                'loyalty_member_id' => $member->id, 'channel' => $channel, 'email' => $email,
                'status' => 'pending', 'sent_at' => null,
            ]);
        });
    }

    /** A retry never repeats pending/failed transport outcomes, and cannot count a settled recipient twice. */
    private function settle(CampaignRecipient $recipient, string $status, ?string $error = null): void
    {
        DB::transaction(function () use ($recipient, $status, $error) {
            $campaign = NotificationCampaign::withoutGlobalScopes()->where('organization_id', $recipient->organization_id)
                ->whereKey($recipient->campaign_id)->lockForUpdate()->first();
            if (!$campaign) return;
            $changed = CampaignRecipient::withoutGlobalScopes()->where('organization_id', $recipient->organization_id)
                ->whereKey($recipient->id)->where('status', 'pending')->update([
                    'status' => $status, 'sent_at' => $status === 'sent' ? now() : null, 'error' => $error,
                ]);
            if ($changed && $status === 'sent') {
                $campaign->increment($recipient->channel === 'email' ? 'email_sent_count' : 'sent_count');
            }
        });
    }

    private function sendPush(
        NotificationCampaign $campaign,
        LoyaltyMember $member,
        NotificationService $notifications,
    ): bool {
        if (NotificationService::optsOut($member->notification_preferences, NotificationService::categoryOf('campaign'))) {
            return false;
        }
        $recipient = $this->claim($campaign, $member, 'push');
        if (!$recipient) return false;

        try {
            $notifications->send($member, [
                // NotificationService::send() records the push under this type
                // and maps it to its opt-in category; without it every push
                // recipient failed on an undefined key and the campaign still
                // ended "sent". 'campaign' is what the inline send this job
                // replaced always passed.
                'type'  => 'campaign',
                'title' => $campaign->title,
                'body'  => $campaign->body,
                'data'  => ['campaign_id' => $campaign->id],
            ]);
            $this->settle($recipient, 'sent');
            return true;
        } catch (\Throwable $e) {
            $this->settle($recipient, 'failed', $e->getMessage());
            return false;
        }
    }

    private function sendEmail(
        NotificationCampaign $campaign,
        LoyaltyMember $member,
        EmailTemplate $template,
        EmailComplianceService $compliance,
        array $identity,
        ?string $orgName,
        ?Organization $org,
        bool &$attempted,
    ): bool {
        // This campaign carries an open-tracking pixel, so it is marketing by
        // any regulator's definition and needs real consent — not merely the
        // `email_notifications` channel switch this path used to check alone.
        if (!$compliance->canReceive($member, 'marketing')) {
            return false;
        }

        $to = $member->user->email ?? null;
        if (!$to) {
            return false;
        }

        $recipient = $this->claim($campaign, $member, 'email', $to);
        if (!$recipient) return false;

        try {
            $rendered = $template->render($member);

            $pixel = '<img src="' . url('/api/v1/track/open/' . $recipient->id)
                . '" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" />';

            $html = $rendered['html'];
            $html = str_contains($html, '</body>')
                ? str_replace('</body>', $pixel . '</body>', $html)
                : $html . $pixel;

            // Unsubscribe footer + RFC 8058 headers below. Gmail and Yahoo
            // require both of a bulk sender.
            $html .= $compliance->footerHtml($member, $orgName);

            $attempted = true;
            $sent = Mail::html($html, function ($message) use (
                $to, $member, $rendered, $compliance, $identity, $orgName, $org
            ) {
                $message->to($to, $member->user->name ?? null)
                        ->subject($rendered['subject']);

                // Send as the venue. Recipients otherwise get marketing from a
                // brand they have never heard of, which is a spam-report magnet
                // — and complaints damage the domain every tenant shares. The
                // ADDRESS stays on the platform domain because that is where
                // SPF and DKIM are published.
                if ($orgName) {
                    $message->from($identity['from_address'], $orgName);
                }
                if ($identity['reply_to']) {
                    $message->replyTo($identity['reply_to'], $orgName ?: null);
                }

                $compliance->applyHeaders($message, $member, 'marketing');
            });

            if ($sent === null) {
                $attempted = false;
                $this->settle($recipient, 'suppressed');
                return false;
            }
            $this->settle($recipient, 'sent');
            return true;
        } catch (\Throwable $e) {
            $this->settle($recipient, 'failed', $e->getMessage());
            Log::warning('notification campaign recipient failed', [
                'campaign_id' => $campaign->id,
                'member_id'   => $member->id,
                'error'       => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Every retry exhausted. Mark the campaign so it stops looking like it is
     * still working — the inline version left it stuck in "sending" forever
     * with no way back.
     */
    public function failed(\Throwable $e): void
    {
        $campaign = NotificationCampaign::withoutGlobalScopes()->find($this->campaignId);

        NotificationCampaign::withoutGlobalScopes()->whereKey($this->campaignId)->where('status', 'sending')->update([
            'status' => 'failed',
        ]);

        Log::error('notification campaign chunk failed permanently', [
            'campaign_id' => $this->campaignId,
            'offset'      => $this->offset,
            'error'       => $e->getMessage(),
        ]);
    }
}
