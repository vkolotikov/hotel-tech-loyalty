<?php

namespace App\Jobs;

use App\Models\LoyaltyMember;
use App\Models\SmsCampaign;
use App\Services\Email\CampaignTags;
use App\Services\Loyalty\Sms\SmsAudience;
use App\Services\Loyalty\Sms\SmsMessage;
use App\Services\Sms\PhoneNumber;
use App\Services\Sms\TwilioSms;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Send one slice of a HexaTech Loyalty SMS campaign (release 4 §5, R4-4) through the venue's own Twilio account, then
 * queue the next.
 *
 * It is handed the members the confirmation counted (SmsStart) and, for each member of its slice: writes the member's
 * sms_campaign_deliveries row — an insert the unique (campaign, member) pair turns into a no-op when the row is
 * already there — and only when this call wrote it, checks the member again (still active, SMS consent still on, a
 * phone number in international form) and hands Twilio their copy, with their own tags filled. The row then says how
 * it went. A retried chunk, or a second worker on the same chunk, finds the rows and passes over those members: a
 * member is texted at most once per campaign. A member whose SMS was under way when the worker stopped stays `pending`
 * and is not texted again.
 *
 * Twilio's answers: accepted (`sent`, with Twilio's SID and the parts it counted); refused for that member (`failed`
 * with Twilio's code; a number that replied STOP, 21610, also turns the member's SMS consent off, as they asked);
 * "too many requests" (429: Twilio took nothing, so the member's row is removed and the same slice is queued again a
 * minute later); the account's credentials refused or the settings gone (the member's row is removed, the campaign
 * marked failed with the reason, and nothing more is sent).
 *
 * It stops at the first chunk that finds the campaign no longer sending (Cancel); what went out stays out. Tenant
 * context is bound by hand: a queued job runs outside the request that queued it.
 */
class SendSmsCampaignChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Members per job: one request each, well inside the job's time. */
    public const CHUNK = 50;

    /** The pause between chunks, which gives Cancel a chance between them. */
    public const SPACING_SECONDS = 2;

    /** How long a slice Twilio asked to slow down waits before it is tried again. */
    public const RETRY_SECONDS = 60;

    public int $tries = 3;
    public int $timeout = 300;

    /** @param list<int> $memberIds the members the confirmation counted, in id order */
    public function __construct(
        public int $campaignId,
        public array $memberIds,
        public int $offset = 0,
    ) {
    }

    public function handle(TwilioSms $twilio): void
    {
        $campaign = SmsCampaign::withoutGlobalScopes()->find($this->campaignId);
        if (!$campaign) {
            return; // deleted meanwhile
        }
        app()->instance('current_organization_id', (int) $campaign->organization_id);
        if ($campaign->status !== SmsMessage::STATUS_SENDING) {
            return; // cancelled, failed or finished meanwhile: nothing more goes out
        }

        $slice = array_values(array_map('intval', array_slice($this->memberIds, $this->offset, self::CHUNK)));
        if ($slice !== []) {
            $stop = $this->sendTo($campaign, $slice, $twilio);
            if ($stop === 'retry') {
                self::dispatch($this->campaignId, $this->memberIds, $this->offset)->delay(now()->addSeconds(self::RETRY_SECONDS));

                return;
            }
            if ($stop !== null) {
                SmsCampaign::withoutGlobalScopes()->whereKey($campaign->id)->where('status', SmsMessage::STATUS_SENDING)
                    ->update(['status' => SmsMessage::STATUS_FAILED, 'error_message' => $stop]);
                Log::warning('loyalty SMS campaign stopped: the Twilio account cannot send', ['campaign_id' => $campaign->id, 'reason' => $stop]);

                return;
            }
        }

        $next = $this->offset + self::CHUNK;
        if ($next >= count($this->memberIds)) {
            SmsCampaign::withoutGlobalScopes()->whereKey($campaign->id)->where('status', SmsMessage::STATUS_SENDING)
                ->update(['status' => SmsMessage::STATUS_SENT, 'sent_at' => now()]);

            return;
        }

        self::dispatch($this->campaignId, $this->memberIds, $next)->delay(now()->addSeconds(self::SPACING_SECONDS));
    }

    /**
     * @param list<int> $ids
     * @return string|null null when the slice is done; `retry` when Twilio asked to slow down; otherwise why nothing
     *   more can be sent (`not_ready`, `twilio_<code>`, `http_<status>`)
     */
    private function sendTo(SmsCampaign $campaign, array $ids, TwilioSms $twilio): ?string
    {
        $orgId = (int) $campaign->organization_id;
        $venue = CampaignTags::venueName($orgId);
        $members = LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('id', $ids)
            ->with(['user:id,name,email,phone', 'tier:id,name'])
            ->get()
            ->keyBy('id');

        foreach ($ids as $id) {
            // A Cancel pressed while this slice runs stops it before the next member.
            if ($campaign->fresh()?->status !== SmsMessage::STATUS_SENDING) {
                return null;
            }
            $member = $members->get($id);
            if (!$member || !$this->claim((int) $campaign->id, $id)) {
                continue; // deleted (or merged away) since Send, or an earlier try already handled this member
            }
            if (!$member->is_active) {
                $this->settle($campaign, $id, 'skipped', 'inactive');
                continue;
            }
            $problem = SmsAudience::problemOf($member);
            if ($problem !== null) {
                $this->settle($campaign, $id, 'skipped', $problem);
                continue;
            }

            $text = SmsMessage::fill((string) $campaign->body, CampaignTags::forMember($member, $venue));
            $result = $twilio->send($orgId, (string) PhoneNumber::e164($member->user?->phone), $text);
            if ($result['ok']) {
                $this->settle($campaign, $id, 'sent', null, $result['sid'], $result['segments']);
                continue;
            }
            if ($result['retry'] || $result['stop']) {
                // Twilio took nothing: the member is not recorded, so the slice's next try (or none) decides.
                $this->release((int) $campaign->id, $id);

                return $result['retry'] ? 'retry' : (string) $result['error'];
            }
            $this->settle($campaign, $id, 'failed', (string) $result['error']);
            if (TwilioSms::unsubscribed($result['error'])) {
                // The number replied STOP to the venue's Twilio number: the member's own "no more SMS".
                LoyaltyMember::withoutGlobalScopes()->whereKey($id)->update(['sms_consent' => false]);
                Log::info('loyalty SMS: a member replied STOP; their SMS consent is now off', ['campaign_id' => $campaign->id, 'member_id' => $id]);
            }
        }

        return null;
    }

    /**
     * Write the member's row for this campaign, or find it there: true only for the call that wrote it. Committed on its
     * own, before the SMS goes, so it survives whatever happens to the worker after.
     */
    private function claim(int $campaignId, int $memberId): bool
    {
        $now = now();

        return DB::table('sms_campaign_deliveries')->insertOrIgnore([
            'campaign_id' => $campaignId,
            'member_id'   => $memberId,
            'status'      => 'pending',
            'created_at'  => $now,
            'updated_at'  => $now,
        ]) === 1;
    }

    /** A member Twilio took nothing for: their row goes, so they are not counted as handled. */
    private function release(int $campaignId, int $memberId): void
    {
        DB::table('sms_campaign_deliveries')->where('campaign_id', $campaignId)->where('member_id', $memberId)->where('status', 'pending')->delete();
    }

    private function settle(SmsCampaign $campaign, int $memberId, string $status, ?string $reason, ?string $sid = null, ?int $segments = null): void
    {
        DB::table('sms_campaign_deliveries')->where('campaign_id', $campaign->id)->where('member_id', $memberId)->update([
            'status'     => $status,
            'reason'     => $reason !== null ? mb_substr($reason, 0, 40) : null,
            'twilio_sid' => $sid,
            'segments'   => $segments,
            'updated_at' => now(),
        ]);
    }

    /**
     * Every try of a chunk gave up. The campaign stops looking as if it were still working; what went out stays out,
     * and its rows say who was texted.
     */
    public function failed(\Throwable $e): void
    {
        SmsCampaign::withoutGlobalScopes()->whereKey($this->campaignId)->where('status', SmsMessage::STATUS_SENDING)
            ->update(['status' => SmsMessage::STATUS_FAILED, 'error_message' => 'job_failed']);

        Log::error('loyalty SMS campaign chunk failed permanently', [
            'campaign_id' => $this->campaignId,
            'offset'      => $this->offset,
            'error'       => $e->getMessage(),
        ]);
    }
}
