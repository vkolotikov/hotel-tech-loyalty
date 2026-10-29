<?php

namespace App\Jobs;

use App\Models\EmailCampaign;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Services\Email\CampaignTags;
use App\Services\EmailComplianceService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
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
 *
 * Once per member, tags per member (HexaTech Loyalty release 3 §4, for the
 * full admin's campaigns and the workspace's alike): a member's row in
 * `email_campaign_deliveries` is written before the send and a retry passes
 * over every member who has one, so a retried chunk (tries = 3) never emails
 * anyone twice; the subject and body have their tags filled for each member
 * by App\Services\Email\CampaignTags.
 */
class SendEmailCampaignChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Recipients per job. Small enough to stay well inside any timeout. */
    public const CHUNK = 100;

    /** A member's row in `email_campaign_deliveries`: written as pending before the send, then what came of it. */
    public const DELIVERY_PENDING = 'pending';
    public const DELIVERY_SENT = 'sent';
    public const DELIVERY_FAILED = 'failed';
    /** The transport's suppression listener cancelled it: counted neither as sent nor as failed. */
    public const DELIVERY_SUPPRESSED = 'suppressed';

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
        if ($campaign->status !== EmailCampaign::STATUS_SENDING) {
            return;
        }

        // No request means no tenant binding. Without this every scoped
        // read below returns nothing (TenantScope fails closed).
        app()->instance('current_organization_id', (int) $campaign->organization_id);

        $slice = array_slice($this->memberIds, $this->offset, self::CHUNK);

        if ($slice === []) {
            $this->complete();
            return;
        }


        // Hourly budget check. Chunk spacing paces ONE campaign; this bounds
        // the total, which is the only number the provider sees. Over budget
        // means LATER, never dropped — a campaign that finishes an hour late is
        // a non-event, a campaign that silently skipped 400 people is a support
        // incident nobody can reconstruct.
        $limiter = app(\App\Services\CampaignRateLimiter::class);
        $reservation = $limiter->reserve($campaign->organization_id, count($slice));
        $allowance = $reservation['count'];
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

        $isMarketing = ($campaign->category ?? 'marketing') !== EmailComplianceService::TRANSACTIONAL;
        $category = $isMarketing ? 'marketing' : EmailComplianceService::TRANSACTIONAL;
        $org = Organization::find($campaign->organization_id);

        // The same sender identity every other venue mail carries: the venue's
        // own sender name and reply-to when it set them, its organisation name
        // and email otherwise — never the raw columns, so the two campaign
        // paths and the transactional mail cannot disagree about who sent it.
        $identity = app(\App\Services\MailIdentityService::class)->forOrganization($campaign->organization_id);
        $orgName  = $identity['from_name'] ?: $org?->name;

        $recipients = LoyaltyMember::whereIn('id', $slice)->with(['user:id,name,email', 'tier:id,name'])->orderBy('id');
        $compliance->scopeEligible($recipients, $category);

        $unused = $allowance;
        $passedOver = 0;

        foreach ($recipients->get() as $member) {
            // Once per member (release 3 §4). The member's row is written BEFORE anything is handed to the mailer,
            // and only the call that wrote it goes on: a retried chunk — or a second job over the same members —
            // finds the row and passes the member over, whatever the row says. At most once, never twice; a member
            // whose send was under way when a worker died keeps a `pending` row and is not tried again.
            if (!$this->claim((int) $campaign->id, (int) $member->id)) {
                $passedOver++;
                continue;
            }

            $email = $member->user?->email;
            if (!$email) {
                $this->settle((int) $campaign->id, (int) $member->id, self::DELIVERY_FAILED);
                continue;
            }

            try {
                // Tags are filled per member after the body was rendered: escaped in the body, one plain line in
                // the subject (CampaignTags, which the test sends and the workspace's preview use too).
                $tags = CampaignTags::forMember($member, (string) $orgName);
                $html = CampaignTags::html((string) $campaign->body_html, $tags);
                $subject = CampaignTags::subject((string) $campaign->subject, $tags);
                if ($isMarketing) {
                    $html .= $compliance->footerHtml($member, $orgName);
                }

                // From this point even an exception may mean the provider accepted it.
                $unused--;
                $message = Mail::html($html, function ($mail) use ($email, $subject, $member, $compliance, $category, $identity) {
                    $mail->to($email, $member->user->name ?? null)
                         ->subject($subject);

                    // Send AS the venue, not as the platform.
                    //
                    // Every campaign previously went out with the global
                    // MAIL_FROM ("Hotel Loyalty" <noreply@hotel-tech.ai>), so a
                    // salon's members received marketing from a hotel brand
                    // they had never heard of — which is both confusing and a
                    // spam-report magnet.
                    //
                    // The From ADDRESS stays on the platform domain on purpose:
                    // that is the domain SPF and DKIM are published for, and
                    // swapping in an unauthenticated tenant address would break
                    // alignment and make deliverability worse, not better.
                    // (Per-tenant authenticated sending domains are the real
                    // fix — see docs/EMAIL_DELIVERABILITY.md.)
                    if ($identity['from_name']) {
                        $mail->from($identity['from_address'], $identity['from_name']);
                    }

                    // Replies reach the venue rather than a noreply mailbox
                    // nobody reads. Recipients replying to a marketing email is
                    // a positive engagement signal to mailbox providers, and
                    // right now those replies are silently discarded.
                    if ($identity['reply_to']) {
                        $mail->replyTo($identity['reply_to'], $identity['from_name'] ?: null);
                    }

                    $compliance->applyHeaders($mail, $member, $category);
                });
                // No message back: the suppression listener (BlockSuppressedRecipients) cancelled it at the
                // transport — not sent, and not a failure either.
                $outcome = $message === null ? self::DELIVERY_SUPPRESSED : self::DELIVERY_SENT;
                if ($outcome === self::DELIVERY_SUPPRESSED) {
                    $unused++;
                }
            } catch (\Throwable $e) {
                $outcome = self::DELIVERY_FAILED;
                Log::warning('campaign recipient failed', [
                    'campaign_id' => $campaign->id,
                    'member_id'   => $member->id,
                    'error'       => $e->getMessage(),
                ]);
            }

            $this->settle((int) $campaign->id, (int) $member->id, $outcome);
        }

        if ($passedOver > 0) {
            Log::info('campaign chunk passed over members already handled', [
                'campaign_id' => $campaign->id,
                'offset'      => $this->offset,
                'members'     => $passedOver,
            ]);
        }

        $limiter->release($reservation['id'], $unused);

        // The counters moved with each member (settle()), so progress is visible while the chunk runs and a chunk
        // that stopped partway and ran again still adds up: its first sends stay counted, its second pass counts
        // nobody twice.
        $campaign->forceFill(['last_progress_at' => now()])->save();

        $nextOffset = $this->offset + count($slice);

        if ($nextOffset >= count($this->memberIds)) {
            $this->complete();
            return;
        }

        if (EmailCampaign::withoutGlobalScopes()->find($this->campaignId)?->status !== EmailCampaign::STATUS_SENDING) {
            return;
        }

        // Pacing between chunks. The old fixed 5s meant 100 recipients every
        // 5 seconds — roughly 72,000/hour — which no shared SMTP relay will
        // accept. Exceeding a relay's ceiling gets mail deferred or the
        // account throttled, and looks like a spam run to the receiving side.
        //
        // Configurable so the interval can be tuned to whatever the relay
        // actually permits without a code change; the default is deliberately
        // conservative (100 per 60s = 6,000/hour).
        $spacing = max(1, (int) config('mail.campaign_chunk_seconds', 60));

        self::dispatch($this->campaignId, $this->memberIds, $nextOffset)
            ->delay(now()->addSeconds($spacing));
    }

    /** Cancellation can happen during this chunk: completion must never undo it. */
    private function complete(): void
    {
        EmailCampaign::withoutGlobalScopes()->whereKey($this->campaignId)
            ->where('status', EmailCampaign::STATUS_SENDING)
            ->update(['status' => EmailCampaign::STATUS_SENT, 'sent_at' => now()]);
    }

    /**
     * Write the member's row for this campaign, or find it there: true only for the call that wrote it. The unique
     * pair (campaign, member) turns a second insert into a no-op, on PostgreSQL and SQLite alike; the row is committed
     * on its own, before the send, so it survives whatever happens to the worker after.
     */
    private function claim(int $campaignId, int $memberId): bool
    {
        $now = now();

        return DB::table('email_campaign_deliveries')->insertOrIgnore([
            'campaign_id' => $campaignId,
            'member_id'   => $memberId,
            'status'      => self::DELIVERY_PENDING,
            'created_at'  => $now,
            'updated_at'  => $now,
        ]) === 1;
    }

    /** What came of the member's send, and the campaign's counter for it, together. */
    private function settle(int $campaignId, int $memberId, string $outcome): void
    {
        DB::transaction(function () use ($campaignId, $memberId, $outcome) {
            DB::table('email_campaign_deliveries')->where('campaign_id', $campaignId)->where('member_id', $memberId)
                ->update(['status' => $outcome, 'updated_at' => now()]);
            $counter = [self::DELIVERY_SENT => 'sent_count', self::DELIVERY_FAILED => 'failed_count'][$outcome] ?? null;
            if ($counter !== null) {
                DB::table('email_campaigns')->where('id', $campaignId)->increment($counter);
            }
        });
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

        EmailCampaign::withoutGlobalScopes()->whereKey($this->campaignId)
            ->where('status', EmailCampaign::STATUS_SENDING)->update([
            'status'        => EmailCampaign::STATUS_FAILED,
            'error_message' => 'Sending stopped at recipient ' . $this->offset . ': ' . $e->getMessage(),
        ]);

        Log::error('campaign send failed', [
            'campaign_id' => $this->campaignId,
            'offset'      => $this->offset,
            'error'       => $e->getMessage(),
        ]);
    }
}
