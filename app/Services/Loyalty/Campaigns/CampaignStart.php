<?php

namespace App\Services\Loyalty\Campaigns;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\MemberSegment;
use App\Models\User;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Support\Facades\Log;

/**
 * Starting a campaign from HexaTech Loyalty (spec 2026-10-21 release 2 §6): the same hand-off as the full admin's
 * EmailCampaignController::send — the campaign set to `sending` with who sent it, its recipient count and zeroed
 * progress, then one SendEmailCampaignChunk for its members from offset 0 — with what the workspace adds so that
 * the confirmation is exactly what happens:
 *
 * - the members handed over are the ones the confirmation counted (CampaignAudience: eligible, with an address,
 *   not suppressed), in id order; the job still checks consent again before every chunk;
 * - the count the person confirmed and the draft they previewed (`revision`) must still be true, or nothing starts
 *   (`audience_changed`, `changed`);
 * - one conditional UPDATE (`draft` → `sending`, on this organisation's row with the content that was checked)
 *   starts it, so two presses cannot start it twice: the second hears `already_started` and dispatches nothing;
 * - an audience over the full admin's cap of 5,000 is refused, not cut.
 */
final class CampaignStart
{
    public function __construct(private readonly CampaignAudience $audience)
    {
    }

    /**
     * Who the campaign would reach now.
     *
     * @return array{segment: MemberSegment, members: int, reached: list<int>, unsubscribed: int, no_consent: int, no_email: int, suppressed: int}
     * @throws LoyaltyRefused `no_audience` without a segment of this organisation, `bad_rule` when its rules have a problem
     */
    public function audienceOf(EmailCampaign $campaign): array
    {
        $segment = $campaign->segment_id ? MemberSegment::query()->find($campaign->segment_id) : null;
        if (!$segment) {
            throw new LoyaltyRefused('no_audience', 'Choose a segment for this campaign first.', 422);
        }
        SegmentRules::assertSound($segment->definition);

        return ['segment' => $segment] + $this->audience->of($segment, (int) $campaign->organization_id);
    }

    /**
     * What stops a draft from going out as it is: an empty subject, a body that says nothing, a button without a
     * label or a link.
     *
     * @return list<string> `subject`, `body`, `button:<index>`
     */
    public static function incomplete(EmailCampaign $campaign): array
    {
        $missing = [];
        if (trim((string) $campaign->subject) === '') {
            $missing[] = 'subject';
        }
        $blocks = is_array($campaign->body_blocks) ? $campaign->body_blocks : [];
        $gaps = CampaignBody::missing($blocks);
        if ($gaps['body'] || trim((string) $campaign->body_html) === '') {
            $missing[] = 'body';
        }
        foreach ($gaps['buttons'] as $i) {
            $missing[] = "button:{$i}";
        }

        return $missing;
    }

    /**
     * @param int $confirmed the number of members the person was told it would email
     * @param string $revision the draft's `updated_at` as the page showed it
     * @throws LoyaltyRefused
     */
    public function start(EmailCampaign $campaign, User $by, int $confirmed, string $revision): EmailCampaign
    {
        if ($campaign->status !== EmailCampaign::STATUS_DRAFT) {
            throw self::alreadyStarted($campaign->status);
        }
        if (!CampaignBody::editable($campaign->body_blocks, $campaign->body_html)) {
            throw new LoyaltyRefused('not_editable_here', 'This campaign is edited and sent in the full admin.', 409);
        }
        if ($revision !== (string) $campaign->updated_at?->toIso8601String()) {
            throw new LoyaltyRefused('changed', 'This campaign changed since it was shown. Check it and send again.', 409);
        }
        $missing = self::incomplete($campaign);
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This campaign is not ready to send.', 422, ['missing' => $missing]);
        }

        $audience = $this->audienceOf($campaign);
        $ids = $audience['reached'];
        $count = count($ids);
        if ($count === 0) {
            throw new LoyaltyRefused('nobody_to_send_to', 'No member of this segment can receive it.', 422);
        }
        if ($count > CampaignAudience::LIMIT) {
            throw new LoyaltyRefused('too_many', 'This audience is larger than one campaign may reach.', 422, ['limit' => CampaignAudience::LIMIT, 'reached' => $count]);
        }
        if ($count !== $confirmed) {
            throw new LoyaltyRefused('audience_changed', 'The number of members it would reach has changed.', 409, ['reached' => $count]);
        }

        // The one write that starts it: only this organisation's row, only while it is the draft that was checked.
        $started = EmailCampaign::query()
            ->whereKey($campaign->id)
            ->where('organization_id', $campaign->organization_id)
            ->where('status', EmailCampaign::STATUS_DRAFT)
            ->where('segment_id', $campaign->segment_id)
            ->where('subject', $campaign->subject)
            ->where('body_html', $campaign->body_html)
            ->update([
                'status'          => EmailCampaign::STATUS_SENDING,
                'sent_by_user_id' => $by->id,
                'recipient_count' => $count,
                'sent_count'      => 0,
                'failed_count'    => 0,
                'error_message'   => null,
            ]);
        if ($started !== 1) {
            $now = EmailCampaign::query()->find($campaign->id);
            throw $now && $now->status !== EmailCampaign::STATUS_DRAFT
                ? self::alreadyStarted($now->status)
                : new LoyaltyRefused('changed', 'This campaign changed since it was shown. Check it and send again.', 409);
        }

        try {
            SendEmailCampaignChunk::dispatch((int) $campaign->id, $ids);
        } catch (\Throwable $e) {
            Log::error('loyalty campaign could not be queued', ['campaign_id' => $campaign->id, 'error' => $e->getMessage()]);
            // Nothing was queued: hand the draft back rather than leave it "sending" with no job behind it — only
            // while nothing was sent. A synchronous queue (local development) runs the job here, and one that
            // stopped partway has already marked the campaign failed, which then stays as the job left it.
            $back = EmailCampaign::query()->whereKey($campaign->id)->where('status', EmailCampaign::STATUS_SENDING)
                ->where('sent_count', 0)->where('failed_count', 0)
                ->update(['status' => EmailCampaign::STATUS_DRAFT, 'sent_by_user_id' => null, 'recipient_count' => 0]);
            if ($back === 1) {
                throw new LoyaltyRefused('not_started', 'The campaign could not be queued. Nothing was sent.', 503);
            }
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = EmailCampaign::query()->findOrFail($campaign->id);
        AuditLog::record('email_campaign_queued', $fresh,
            ['recipients' => $count, 'segment_id' => (int) $campaign->segment_id], [], $by,
            "Email campaign '{$fresh->name}' queued for {$count} recipients");

        return $fresh;
    }

    private static function alreadyStarted(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('already_started', 'This campaign was already started.', 409, ['status' => $status]);
    }
}
