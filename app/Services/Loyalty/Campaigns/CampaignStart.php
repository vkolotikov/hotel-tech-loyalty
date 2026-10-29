<?php

namespace App\Services\Loyalty\Campaigns;

use App\Jobs\SendEmailCampaignChunk;
use App\Models\AuditLog;
use App\Models\EmailCampaign;
use App\Models\LoyaltyMember;
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
 *
 * Release 4 (§5): send later. `schedule()` sets a draft to `scheduled` at an instant chosen on the venue's clock
 * (SendLater), with the same checks as Send but no confirmed count (it goes to whoever is eligible then), and moves a
 * scheduled one; `unschedule()` takes it back to a draft. `startScheduled()`, called by `loyalty:send-scheduled` once
 * it is due, starts it with one conditional update (`scheduled` → `sending`), handing the job the members eligible at
 * that moment; a second run, or a second worker, finds it no longer scheduled and starts nothing.
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

        return $this->beginDraft($campaign, $by, $ids, $audience['segment']);
    }

    /**
     * The existing full-admin HTML editor and explicit-member API retain their payloads. Both now use the same
     * audience checks, atomic draft claim and queue-failure recovery as the Loyalty workspace.
     */
    public function startFullAdmin(EmailCampaign $campaign, User $by, array $memberIds = []): EmailCampaign
    {
        if ($campaign->status !== EmailCampaign::STATUS_DRAFT) {
            throw self::alreadyStarted($campaign->status);
        }
        if (trim((string) $campaign->subject) === '' || trim((string) $campaign->body_html) === '') {
            throw new LoyaltyRefused('incomplete', 'Add a subject and message before sending.', 422);
        }
        $segment = null;
        if ($campaign->segment_id) {
            $audience = $this->audienceOf($campaign);
            $segment = $audience['segment'];
        } else {
            $memberIds = array_values(array_unique(array_map('intval', $memberIds)));
            $owned = LoyaltyMember::query()->where('organization_id', $campaign->organization_id)
                ->whereIn('id', $memberIds)->count();
            if ($owned !== count($memberIds)) {
                throw new LoyaltyRefused('bad_recipients', 'Choose members of this organisation.', 422);
            }
            $audience = $this->audience->ofMembers($memberIds, (int) $campaign->organization_id);
        }
        $ids = $audience['reached'];
        if ($ids === []) {
            throw new LoyaltyRefused('nobody_to_send_to', 'No eligible recipients — choose members who can receive marketing emails.', 422);
        }
        if (count($ids) > CampaignAudience::LIMIT) {
            throw new LoyaltyRefused('too_many', 'This audience is larger than one campaign may reach.', 422);
        }

        return $this->beginDraft($campaign, $by, $ids, $segment);
    }

    private function beginDraft(EmailCampaign $campaign, User $by, array $ids, ?MemberSegment $segment): EmailCampaign
    {
        $count = count($ids);

        // The one write that starts it: only this organisation's row, only while it is the draft that was checked.
        $started = EmailCampaign::query()
            ->whereKey($campaign->id)
            ->where('organization_id', $campaign->organization_id)
            ->where('status', EmailCampaign::STATUS_DRAFT)
            ->where('segment_id', $campaign->segment_id)
            ->where('subject', $campaign->subject)
            ->where('body_html', $campaign->body_html)
            ->where('updated_at', $campaign->getRawOriginal('updated_at'))
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

        if (!$this->handOver($campaign, $ids, EmailCampaign::STATUS_DRAFT)) {
            throw new LoyaltyRefused('not_started', 'The campaign could not be queued. Nothing was sent.', 503);
        }

        $segment?->forceFill(['last_sent_at' => now()])->save();
        $fresh = EmailCampaign::query()->findOrFail($campaign->id);
        AuditLog::record('email_campaign_queued', $fresh,
            ['recipients' => $count, 'segment_id' => (int) $campaign->segment_id], [], $by,
            "Email campaign '{$fresh->name}' queued for {$count} recipients");

        return $fresh;
    }

    /**
     * Send later (release 4 §5): a draft set to go out at a time on the venue's clock, or a scheduled one moved to
     * another time. The draft is checked as Send checks it — still a draft of the workspace's blocks, the revision
     * shown, nothing missing, a segment whose rules are sound — but no count is confirmed: it goes to whoever is
     * eligible when it starts. One conditional update sets it, on the draft that was checked.
     *
     * @param string $sendAt the venue's wall clock, `YYYY-MM-DDTHH:mm`
     * @return array{campaign: EmailCampaign, about: int} `about`: how many it would reach now
     * @throws LoyaltyRefused `bad_time` (SendLater), and Send's own refusals
     */
    public function schedule(EmailCampaign $campaign, User $by, string $sendAt, string $revision): array
    {
        $orgId = (int) $campaign->organization_id;
        if (!in_array($campaign->status, [EmailCampaign::STATUS_DRAFT, SendLater::STATUS], true)) {
            throw self::alreadyStarted($campaign->status);
        }
        if (!CampaignBody::editable($campaign->body_blocks, $campaign->body_html)) {
            throw new LoyaltyRefused('not_editable_here', 'This campaign is edited and sent in the full admin.', 409);
        }
        if ($revision !== (string) $campaign->updated_at?->toIso8601String()) {
            throw new LoyaltyRefused('changed', 'This campaign changed since it was shown. Check it and send again.', 409);
        }
        $at = SendLater::instantOf($sendAt, $orgId);
        $missing = self::incomplete($campaign);
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This campaign is not ready to send.', 422, ['missing' => $missing]);
        }
        $about = count($this->audienceOf($campaign)['reached']);
        $was = $campaign->status;

        $query = EmailCampaign::query()->whereKey($campaign->id)->where('organization_id', $orgId)->where('status', $was);
        if ($was === EmailCampaign::STATUS_DRAFT) {
            $query->where('segment_id', $campaign->segment_id)->where('subject', $campaign->subject)->where('body_html', $campaign->body_html);
        }
        $set = $query->update([
            'status'          => SendLater::STATUS,
            'scheduled_at'    => $at,
            'sent_by_user_id' => $by->id,
            'recipient_count' => 0,
            'sent_count'      => 0,
            'failed_count'    => 0,
            'error_message'   => null,
        ]);
        if ($set !== 1) {
            $now = EmailCampaign::query()->find($campaign->id);
            throw $now && !in_array($now->status, [EmailCampaign::STATUS_DRAFT, SendLater::STATUS], true)
                ? self::alreadyStarted($now->status)
                : new LoyaltyRefused('changed', 'This campaign changed since it was shown. Check it and send again.', 409);
        }

        $fresh = EmailCampaign::query()->findOrFail($campaign->id);
        AuditLog::record($was === SendLater::STATUS ? 'email_campaign_rescheduled' : 'email_campaign_scheduled', $fresh,
            ['send_at' => $at->toIso8601String(), 'send_at_venue' => SendLater::wallOf($at, $orgId), 'about' => $about, 'segment_id' => (int) $campaign->segment_id],
            $was === SendLater::STATUS ? ['send_at' => self::scheduledAt($campaign)?->toIso8601String()] : [], $by,
            "Email campaign '{$fresh->name}' scheduled for " . SendLater::wallOf($at, $orgId) . " (venue time), about {$about} recipients now");

        return ['campaign' => $fresh, 'about' => $about];
    }

    /** A scheduled campaign back to a draft: nothing is sent. @throws LoyaltyRefused `not_scheduled` */
    public function unschedule(EmailCampaign $campaign, User $by): EmailCampaign
    {
        $back = EmailCampaign::query()->whereKey($campaign->id)->where('organization_id', $campaign->organization_id)
            ->where('status', SendLater::STATUS)
            ->update(['status' => EmailCampaign::STATUS_DRAFT, 'scheduled_at' => null, 'sent_by_user_id' => null]);
        if ($back !== 1) {
            throw SendLater::notScheduled((string) (EmailCampaign::query()->find($campaign->id)?->status ?? ''));
        }

        $fresh = EmailCampaign::query()->findOrFail($campaign->id);
        AuditLog::record('email_campaign_unscheduled', $fresh, ['status' => EmailCampaign::STATUS_DRAFT],
            ['status' => SendLater::STATUS, 'send_at' => self::scheduledAt($campaign)?->toIso8601String()], $by,
            "Email campaign '{$fresh->name}' taken back to a draft; nothing was sent");

        return $fresh;
    }

    /**
     * Start a scheduled campaign that is due (`loyalty:send-scheduled`), to whoever is eligible now: one conditional
     * update (`scheduled` → `sending`, while it is still due and its content as it was), then the job for those
     * members. A campaign that cannot start (nobody eligible, over the cap, its segment gone or broken, incomplete) is
     * marked failed with the reason; one that another run started, or someone moved or took back meanwhile, is left.
     *
     * @return string `started`, `left` (not due, or no longer scheduled), `not_started` (the queue refused it; it stays
     *   scheduled and the next run tries again), or the code of what stopped it
     */
    public function startScheduled(EmailCampaign $campaign): string
    {
        $due = self::scheduledAt($campaign);
        if ($campaign->status !== SendLater::STATUS || $due === null || $due->isFuture()) {
            return 'left';
        }

        $ids = [];
        $audience = null;
        try {
            SendLater::assertStillAllowed((int) $campaign->organization_id, 'campaigns');
            if (!CampaignBody::editable($campaign->body_blocks, $campaign->body_html)) {
                throw new LoyaltyRefused('not_editable_here', '', 409);
            }
            if (self::incomplete($campaign) !== []) {
                throw new LoyaltyRefused('incomplete', '', 422);
            }
            $audience = $this->audienceOf($campaign);
            $ids = $audience['reached'];
            if ($ids === []) {
                throw new LoyaltyRefused('nobody_to_send_to', '', 422);
            }
            if (count($ids) > CampaignAudience::LIMIT) {
                throw new LoyaltyRefused('too_many', '', 422);
            }
        } catch (LoyaltyRefused $e) {
            $failed = EmailCampaign::query()->whereKey($campaign->id)->where('status', SendLater::STATUS)
                ->update(['status' => EmailCampaign::STATUS_FAILED, 'error_message' => SendLater::FAILED_PREFIX . $e->errorCode]);
            if ($failed === 1) {
                AuditLog::record('email_campaign_schedule_failed', $campaign, ['reason' => $e->errorCode], ['status' => SendLater::STATUS],
                    self::scheduler($campaign), "Email campaign '{$campaign->name}' was due but did not start: {$e->errorCode}");
            }

            return $failed === 1 ? $e->errorCode : 'left';
        }
        $count = count($ids);

        $started = EmailCampaign::query()
            ->whereKey($campaign->id)
            ->where('organization_id', $campaign->organization_id)
            ->where('status', SendLater::STATUS)
            ->where('scheduled_at', '<=', now())
            ->where('segment_id', $campaign->segment_id)
            ->where('subject', $campaign->subject)
            ->where('body_html', $campaign->body_html)
            ->update([
                'status'          => EmailCampaign::STATUS_SENDING,
                'recipient_count' => $count,
                'sent_count'      => 0,
                'failed_count'    => 0,
                'error_message'   => null,
            ]);
        if ($started !== 1) {
            return 'left';
        }
        if (!$this->handOver($campaign, $ids, SendLater::STATUS)) {
            return 'not_started';
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = EmailCampaign::query()->findOrFail($campaign->id);
        AuditLog::record('email_campaign_queued', $fresh,
            ['recipients' => $count, 'segment_id' => (int) $campaign->segment_id, 'scheduled' => true], [], self::scheduler($campaign),
            "Scheduled email campaign '{$fresh->name}' queued for {$count} recipients");

        return 'started';
    }

    /** When a campaign is scheduled for, as an instant (the column is read raw: the model has no cast for it). */
    public static function scheduledAt(EmailCampaign $campaign): ?\Carbon\CarbonImmutable
    {
        $raw = $campaign->getAttributes()['scheduled_at'] ?? null;
        if ($raw === null || $raw === '') {
            return null;
        }

        return $raw instanceof \DateTimeInterface ? \Carbon\CarbonImmutable::instance($raw)->utc() : \Carbon\CarbonImmutable::parse((string) $raw, 'UTC');
    }

    /**
     * Queue the job for these members. When the queue refuses it, nothing was queued: the campaign goes back to what
     * it was (`$back`: a draft, or scheduled for the next run to try again) rather than stay "sending" with no job
     * behind it — only while nothing was sent. A synchronous queue (local development) runs the job here, and one
     * that stopped partway has already marked the campaign failed, which then stays as the job left it.
     *
     * @param list<int> $ids
     */
    private function handOver(EmailCampaign $campaign, array $ids, string $back): bool
    {
        try {
            SendEmailCampaignChunk::dispatch((int) $campaign->id, $ids);
        } catch (\Throwable $e) {
            Log::error('loyalty campaign could not be queued', ['campaign_id' => $campaign->id, 'error' => $e->getMessage()]);
            $undo = $back === EmailCampaign::STATUS_DRAFT
                ? ['status' => EmailCampaign::STATUS_DRAFT, 'sent_by_user_id' => null, 'recipient_count' => 0]
                : ['status' => SendLater::STATUS, 'recipient_count' => 0];
            $reverted = EmailCampaign::query()->whereKey($campaign->id)->where('status', EmailCampaign::STATUS_SENDING)
                ->where('sent_count', 0)->where('failed_count', 0)
                ->update($undo);

            return $reverted !== 1;
        }

        return true;
    }

    /** Who scheduled it (they pressed Send later): the causer of what the scheduler does for them. */
    private static function scheduler(EmailCampaign $campaign): ?User
    {
        return $campaign->sent_by_user_id ? User::query()->find($campaign->sent_by_user_id) : null;
    }

    private static function alreadyStarted(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('already_started', 'This campaign was already started.', 409, ['status' => $status]);
    }
}
