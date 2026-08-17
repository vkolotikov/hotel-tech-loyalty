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

        if (!$campaign) {
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
        if ($limiter->allowance($campaign->organization_id, count($slice)) < 1) {
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

        $sendEmail = in_array($campaign->channel, ['email', 'both'], true);
        $sendPush  = in_array($campaign->channel, ['push', 'both'], true);

        $template = $campaign->email_template_id
            ? EmailTemplate::withoutGlobalScopes()->find($campaign->email_template_id)
            : null;

        $org      = Organization::withoutGlobalScopes()->find($campaign->organization_id);
        $identity = $identityService->forOrganization($campaign->organization_id);
        $orgName  = $identity['from_name'] ?: $org?->name;

        $pushSent = 0;
        $emailSent = 0;

        $members = LoyaltyMember::whereIn('id', $slice)->with(['user', 'tier'])->get();

        foreach ($members as $member) {
            if ($sendPush && $member->expo_push_token) {
                $pushSent += $this->sendPush($campaign, $member, $notifications) ? 1 : 0;
            }

            if ($sendEmail && $template) {
                $emailSent += $this->sendEmail(
                    $campaign, $member, $template, $compliance, $identity, $orgName, $org,
                ) ? 1 : 0;
            }
        }

        // Only EMAIL consumes the mail budget; push goes to Expo, not the relay.
        $limiter->record($campaign->organization_id, $emailSent);

        // Counters accumulate per chunk, so progress survives a crash and is
        // visible to the admin while the send is still running.
        if ($pushSent)  $campaign->increment('sent_count', $pushSent);
        if ($emailSent) $campaign->increment('email_sent_count', $emailSent);

        $nextOffset = $this->offset + self::CHUNK;

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
        $campaign->forceFill([
            'status'  => 'sent',
            'sent_at' => now(),
        ])->save();
    }

    private function sendPush(
        NotificationCampaign $campaign,
        LoyaltyMember $member,
        NotificationService $notifications,
    ): bool {
        $recipient = CampaignRecipient::create([
            'campaign_id'       => $campaign->id,
            'loyalty_member_id' => $member->id,
            'channel'           => 'push',
            'status'            => 'sent',
            'sent_at'           => now(),
        ]);

        try {
            $notifications->send($member, [
                'title' => $campaign->title,
                'body'  => $campaign->body,
                'data'  => ['campaign_id' => $campaign->id],
            ]);
            return true;
        } catch (\Throwable $e) {
            $recipient->update(['status' => 'failed', 'error' => $e->getMessage()]);
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

        $recipient = CampaignRecipient::create([
            'campaign_id'       => $campaign->id,
            'loyalty_member_id' => $member->id,
            'channel'           => 'email',
            'email'             => $to,
            'status'            => 'sent',
            'sent_at'           => now(),
        ]);

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

            Mail::html($html, function ($message) use (
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

            return true;
        } catch (\Throwable $e) {
            $recipient->update(['status' => 'failed', 'error' => $e->getMessage()]);
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

        $campaign?->forceFill([
            'status' => 'failed',
        ])->save();

        Log::error('notification campaign chunk failed permanently', [
            'campaign_id' => $this->campaignId,
            'offset'      => $this->offset,
            'error'       => $e->getMessage(),
        ]);
    }
}
