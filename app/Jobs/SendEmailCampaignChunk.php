<?php

namespace App\Jobs;

use App\Models\EmailCampaign;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Services\EmailComplianceService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Send one slice of a campaign, then queue the next.
 *
 * Chains rather than fanning out: a self-dispatching chunk keeps the
 * campaign's counters accurate without a batch, gives a natural resume
 * point after a failure, and — more importantly — paces delivery instead
 * of handing an SMTP relay 5 000 messages at once, which is how a sender
 * reputation gets destroyed on the first campaign.
 *
 * Tenant context has to be re-bound by hand: a queued job runs outside the
 * request that created it, so TenantMiddleware never fires and every
 * scoped query would fail closed.
 */
class SendEmailCampaignChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Recipients per job. Small enough to stay well inside any timeout. */
    public const CHUNK = 100;

    public int $tries = 3;
    public int $timeout = 300;

    public function __construct(
        public int $campaignId,
        public array $memberIds,
        public int $offset = 0,
    ) {
    }

    public function handle(EmailComplianceService $compliance): void
    {
        $campaign = EmailCampaign::withoutGlobalScopes()->find($this->campaignId);

        if (!$campaign) {
            return; // deleted mid-flight
        }

        // A cancelled campaign stops the chain rather than draining it.
        if ($campaign->status === EmailCampaign::STATUS_CANCELLED) {
            Log::info('campaign send cancelled', ['campaign_id' => $campaign->id]);
            return;
        }

        // No request means no tenant binding. Without this every scoped
        // read below returns nothing (TenantScope fails closed).
        app()->instance('current_organization_id', (int) $campaign->organization_id);

        $slice = array_slice($this->memberIds, $this->offset, self::CHUNK);

        if ($slice === []) {
            $campaign->forceFill([
                'status'     => EmailCampaign::STATUS_SENT,
                'sent_at'    => now(),
            ])->save();
            return;
        }

        $isMarketing = ($campaign->category ?? 'marketing') !== EmailComplianceService::TRANSACTIONAL;
        $category = $isMarketing ? 'marketing' : EmailComplianceService::TRANSACTIONAL;
        $orgName = Organization::find($campaign->organization_id)?->name;

        $recipients = LoyaltyMember::whereIn('id', $slice)->with('user:id,name,email');
        $compliance->scopeEligible($recipients, $category);

        $sent = 0;
        $failed = 0;

        foreach ($recipients->get() as $member) {
            $email = $member->user?->email;
            if (!$email) {
                $failed++;
                continue;
            }

            try {
                $html = $campaign->body_html;
                if ($isMarketing) {
                    $html .= $compliance->footerHtml($member, $orgName);
                }

                Mail::html($html, function ($mail) use ($email, $campaign, $member, $compliance, $category) {
                    $mail->to($email, $member->user->name ?? null)
                         ->subject($campaign->subject);
                    $compliance->applyHeaders($mail, $member, $category);
                });
                $sent++;
            } catch (\Throwable $e) {
                $failed++;
                Log::warning('campaign recipient failed', [
                    'campaign_id' => $campaign->id,
                    'member_id'   => $member->id,
                    'error'       => $e->getMessage(),
                ]);
            }
        }

        // Counters accumulate per chunk, so progress survives a crash and
        // is visible to the admin while the send is still running.
        $campaign->increment('sent_count', $sent);
        $campaign->increment('failed_count', $failed);
        $campaign->forceFill(['last_progress_at' => now()])->save();

        $nextOffset = $this->offset + self::CHUNK;

        if ($nextOffset >= count($this->memberIds)) {
            $campaign->forceFill([
                'status'  => EmailCampaign::STATUS_SENT,
                'sent_at' => now(),
            ])->save();
            return;
        }

        self::dispatch($this->campaignId, $this->memberIds, $nextOffset)
            // Brief spacing between chunks: kinder to the relay and keeps
            // one campaign from monopolising the worker.
            ->delay(now()->addSeconds(5));
    }

    /**
     * Every retry exhausted. Mark the campaign so it stops looking like
     * it is still working — the old code left it stuck in SENDING with no
     * way back, and send/update/destroy all refuse a non-draft row.
     */
    public function failed(\Throwable $e): void
    {
        $campaign = EmailCampaign::withoutGlobalScopes()->find($this->campaignId);
        if (!$campaign) {
            return;
        }

        $campaign->forceFill([
            'status'        => EmailCampaign::STATUS_FAILED,
            'error_message' => 'Sending stopped at recipient ' . $this->offset . ': ' . $e->getMessage(),
        ])->save();

        Log::error('campaign send failed', [
            'campaign_id' => $this->campaignId,
            'offset'      => $this->offset,
            'error'       => $e->getMessage(),
        ]);
    }
}
