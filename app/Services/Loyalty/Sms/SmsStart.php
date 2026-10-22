<?php

namespace App\Services\Loyalty\Sms;

use App\Jobs\SendSmsCampaignChunk;
use App\Models\AuditLog;
use App\Models\MemberSegment;
use App\Models\SmsCampaign;
use App\Models\User;
use App\Services\Email\CampaignTags;
use App\Services\Loyalty\Campaigns\SegmentRules;
use App\Services\Loyalty\Campaigns\SendLater;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Sms\TwilioSms;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Starting an SMS campaign (release 4 §5), with the once-only rules of email and push (Campaigns\CampaignStart,
 * Push\PushStart):
 *
 * - the venue's Twilio account must be set up (`not_ready`, with what is missing or wrong);
 * - the members handed to the job are the ones the confirmation counted (SmsAudience: active segment members with
 *   SMS consent and a phone number in international form, each number once), in id order; the job checks each again;
 * - the count the person confirmed and the draft they saw (`revision`) must still be true, or nothing starts
 *   (`audience_changed`, `changed`);
 * - one conditional UPDATE (`draft` → `sending`, on this organisation's campaign with the content that was checked)
 *   starts it, so two presses cannot start it twice: the second hears `already_started` and dispatches nothing;
 * - an audience over the cap is refused, not cut.
 *
 * Send later as for email and push (SendLater): `schedule()`, `unschedule()`, and `startScheduled()` once it is due,
 * to whoever can be texted then.
 */
final class SmsStart
{
    public function __construct(private readonly SmsAudience $audience, private readonly TwilioSms $twilio)
    {
    }

    /**
     * Who the campaign would text now, and how many SMS parts that comes to.
     *
     * @return array{segment: MemberSegment, members: int, reached: list<int>, no_consent: int, no_phone: int, bad_phone: int, same_phone: int, segments: int}
     * @throws LoyaltyRefused `no_audience` without a segment of this organisation, `bad_rule` when its rules have a problem
     */
    public function audienceOf(SmsCampaign $c): array
    {
        $segment = $c->member_segment_id ? MemberSegment::query()->find($c->member_segment_id) : null;
        if (!$segment) {
            throw new LoyaltyRefused('no_audience', 'Choose a segment for this campaign first.', 422);
        }
        SegmentRules::assertSound($segment->definition);

        return ['segment' => $segment] + $this->audience->of($segment, (string) $c->body, CampaignTags::venueName((int) $c->organization_id));
    }

    /** @throws LoyaltyRefused `not_ready` while the venue's Twilio account is not set up */
    public function assertReady(int $orgId): void
    {
        $twilio = $this->twilio->readiness($orgId);
        if (!$twilio['ready']) {
            throw new LoyaltyRefused('not_ready', 'Set up the venue’s Twilio account first.', 409, ['missing' => $twilio['missing'], 'wrong' => $twilio['wrong']]);
        }
    }

    /**
     * @param int $confirmed the number of members the person was told it would text
     * @param string $revision the draft's `updated_at` as the page showed it
     * @throws LoyaltyRefused
     */
    public function start(SmsCampaign $c, User $by, int $confirmed, string $revision): SmsCampaign
    {
        if ($c->status !== SmsMessage::STATUS_DRAFT) {
            throw self::alreadyStarted((string) $c->status);
        }
        if ($revision !== SmsMessage::revision($c)) {
            throw self::changed();
        }
        $this->assertReady((int) $c->organization_id);
        $missing = SmsMessage::incomplete($c);
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This campaign is not ready to send.', 422, ['missing' => $missing]);
        }

        $audience = $this->audienceOf($c);
        $ids = $audience['reached'];
        $count = count($ids);
        if ($count === 0) {
            throw new LoyaltyRefused('nobody_to_send_to', 'No member of this segment can receive it.', 422);
        }
        if ($count > SmsMessage::LIMIT) {
            throw new LoyaltyRefused('too_many', 'This audience is larger than one campaign may reach.', 422, ['limit' => SmsMessage::LIMIT, 'reached' => $count]);
        }
        if ($count !== $confirmed) {
            throw new LoyaltyRefused('audience_changed', 'The number of members it would reach has changed.', 409, ['reached' => $count]);
        }

        // The one write that starts it: only this organisation's campaign, only while it is the draft checked.
        $started = SmsMessage::query()
            ->whereKey($c->id)
            ->where('organization_id', $c->organization_id)
            ->where('status', SmsMessage::STATUS_DRAFT)
            ->where('member_segment_id', $c->member_segment_id)
            ->where('body', $c->body)
            ->update([
                'status'          => SmsMessage::STATUS_SENDING,
                'sent_by_user_id' => $by->id,
                'recipient_count' => $count,
                'sent_at'         => null,
                'error_message'   => null,
            ]);
        if ($started !== 1) {
            $now = SmsMessage::query()->find($c->id);
            throw $now && $now->status !== SmsMessage::STATUS_DRAFT ? self::alreadyStarted((string) $now->status) : self::changed();
        }

        if (!$this->handOver($c, $ids, SmsMessage::STATUS_DRAFT)) {
            throw new LoyaltyRefused('not_started', 'The campaign could not be queued. Nothing was sent.', 503);
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = SmsMessage::query()->findOrFail($c->id);
        AuditLog::record('sms_campaign_queued', $fresh,
            ['recipients' => $count, 'segments' => $audience['segments'], 'segment_id' => (int) $c->member_segment_id], [], $by,
            "SMS campaign '{$fresh->name}' queued for {$count} members ({$audience['segments']} SMS parts)");

        return $fresh;
    }

    /**
     * Send later: a draft set to go out at a time on the venue's clock, or a scheduled one moved. Checked as Send
     * checks it (Twilio set up, the revision shown, a text, a segment with sound rules), but no count is confirmed: it
     * goes to whoever can be texted when it starts.
     *
     * @param string $sendAt the venue's wall clock, `YYYY-MM-DDTHH:mm`
     * @return array{sms: SmsCampaign, about: int, segments: int} how many it would reach now, and their SMS parts
     */
    public function schedule(SmsCampaign $c, User $by, string $sendAt, string $revision): array
    {
        $orgId = (int) $c->organization_id;
        if (!in_array($c->status, [SmsMessage::STATUS_DRAFT, SmsMessage::STATUS_SCHEDULED], true)) {
            throw self::alreadyStarted((string) $c->status);
        }
        if ($revision !== SmsMessage::revision($c)) {
            throw self::changed();
        }
        $at = SendLater::instantOf($sendAt, $orgId);
        $this->assertReady($orgId);
        $missing = SmsMessage::incomplete($c);
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This campaign is not ready to send.', 422, ['missing' => $missing]);
        }
        $audience = $this->audienceOf($c);
        $about = count($audience['reached']);
        $was = (string) $c->status;
        $before = $c->scheduled_at?->toIso8601String();

        $query = SmsMessage::query()->whereKey($c->id)->where('organization_id', $orgId)->where('status', $was);
        if ($was === SmsMessage::STATUS_DRAFT) {
            $query->where('member_segment_id', $c->member_segment_id)->where('body', $c->body);
        }
        $set = $query->update([
            'status'          => SmsMessage::STATUS_SCHEDULED,
            'scheduled_at'    => $at,
            'sent_by_user_id' => $by->id,
            'recipient_count' => 0,
            'error_message'   => null,
        ]);
        if ($set !== 1) {
            $now = SmsMessage::query()->find($c->id);
            throw $now && !in_array($now->status, [SmsMessage::STATUS_DRAFT, SmsMessage::STATUS_SCHEDULED], true) ? self::alreadyStarted((string) $now->status) : self::changed();
        }

        $fresh = SmsMessage::query()->findOrFail($c->id);
        AuditLog::record($was === SmsMessage::STATUS_SCHEDULED ? 'sms_campaign_rescheduled' : 'sms_campaign_scheduled', $fresh,
            ['send_at' => $at->toIso8601String(), 'send_at_venue' => SendLater::wallOf($at, $orgId), 'about' => $about, 'segments' => $audience['segments'],
             'segment_id' => (int) $c->member_segment_id],
            $was === SmsMessage::STATUS_SCHEDULED ? ['send_at' => $before] : [], $by,
            "SMS campaign '{$fresh->name}' scheduled for " . SendLater::wallOf($at, $orgId) . " (venue time), about {$about} members now");

        return ['sms' => $fresh, 'about' => $about, 'segments' => $audience['segments']];
    }

    /** A scheduled campaign back to a draft: nothing is sent. @throws LoyaltyRefused `not_scheduled` */
    public function unschedule(SmsCampaign $c, User $by): SmsCampaign
    {
        $back = SmsMessage::query()->whereKey($c->id)->where('organization_id', $c->organization_id)->where('status', SmsMessage::STATUS_SCHEDULED)
            ->update(['status' => SmsMessage::STATUS_DRAFT, 'scheduled_at' => null, 'sent_by_user_id' => null]);
        if ($back !== 1) {
            throw SendLater::notScheduled((string) (SmsMessage::query()->find($c->id)?->status ?? ''));
        }

        $fresh = SmsMessage::query()->findOrFail($c->id);
        AuditLog::record('sms_campaign_unscheduled', $fresh, ['status' => SmsMessage::STATUS_DRAFT],
            ['status' => SmsMessage::STATUS_SCHEDULED, 'send_at' => $c->scheduled_at?->toIso8601String()], $by,
            "SMS campaign '{$fresh->name}' taken back to a draft; nothing was sent");

        return $fresh;
    }

    /**
     * Start a scheduled campaign that is due (`loyalty:send-scheduled`), to whoever can be texted now, with one
     * conditional update (`scheduled` → `sending`). One that cannot start (Twilio not set up, nobody eligible, over the
     * cap, its segment gone or broken, no text) is marked failed with the reason in `error_message`; one that another
     * run started, or someone moved or took back meanwhile, is left.
     *
     * @return string `started`, `left`, `not_started` (the queue refused it; it stays scheduled), or the reason's code
     */
    public function startScheduled(SmsCampaign $c): string
    {
        if ($c->status !== SmsMessage::STATUS_SCHEDULED || $c->scheduled_at === null || $c->scheduled_at->isFuture()) {
            return 'left';
        }

        try {
            $this->assertReady((int) $c->organization_id);
            if (SmsMessage::incomplete($c) !== []) {
                throw new LoyaltyRefused('incomplete', '', 422);
            }
            $audience = $this->audienceOf($c);
            $ids = $audience['reached'];
            if ($ids === []) {
                throw new LoyaltyRefused('nobody_to_send_to', '', 422);
            }
            if (count($ids) > SmsMessage::LIMIT) {
                throw new LoyaltyRefused('too_many', '', 422);
            }
        } catch (LoyaltyRefused $e) {
            $failed = SmsMessage::query()->whereKey($c->id)->where('status', SmsMessage::STATUS_SCHEDULED)
                ->update(['status' => SmsMessage::STATUS_FAILED, 'error_message' => $e->errorCode]);
            if ($failed === 1) {
                AuditLog::record('sms_campaign_schedule_failed', $c, ['reason' => $e->errorCode], ['status' => SmsMessage::STATUS_SCHEDULED],
                    self::scheduler($c), "SMS campaign '{$c->name}' was due but did not start: {$e->errorCode}");
            }

            return $failed === 1 ? $e->errorCode : 'left';
        }
        $count = count($ids);

        $started = SmsMessage::query()
            ->whereKey($c->id)
            ->where('organization_id', $c->organization_id)
            ->where('status', SmsMessage::STATUS_SCHEDULED)
            ->where('scheduled_at', '<=', now())
            ->where('member_segment_id', $c->member_segment_id)
            ->where('body', $c->body)
            ->update(['status' => SmsMessage::STATUS_SENDING, 'recipient_count' => $count, 'sent_at' => null, 'error_message' => null]);
        if ($started !== 1) {
            return 'left';
        }
        if (!$this->handOver($c, $ids, SmsMessage::STATUS_SCHEDULED)) {
            return 'not_started';
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = SmsMessage::query()->findOrFail($c->id);
        AuditLog::record('sms_campaign_queued', $fresh,
            ['recipients' => $count, 'segments' => $audience['segments'], 'segment_id' => (int) $c->member_segment_id, 'scheduled' => true], [],
            self::scheduler($c), "Scheduled SMS campaign '{$fresh->name}' queued for {$count} members ({$audience['segments']} SMS parts)");

        return 'started';
    }

    /**
     * How far campaigns got, from their delivery rows: each outcome counted once per member, the SMS parts Twilio
     * counted for those it took, and when the last member was handled.
     *
     * @param list<int> $ids
     * @return array<int, array{sent: int, failed: int, skipped: int, pending: int, segments: int, last: ?string}>
     */
    public static function resultsOf(array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[(int) $id] = array_fill_keys(SmsMessage::OUTCOMES, 0) + ['segments' => 0, 'last' => null];
        }
        if ($ids === []) {
            return $out;
        }
        $rows = DB::table('sms_campaign_deliveries')
            ->whereIn('campaign_id', $ids)
            ->groupBy('campaign_id', 'status')
            ->select('campaign_id', 'status', DB::raw('COUNT(*) AS n'), DB::raw('SUM(COALESCE(segments, 0)) AS parts'), DB::raw('MAX(updated_at) AS last'))
            ->get();
        foreach ($rows as $row) {
            $id = (int) $row->campaign_id;
            $status = in_array($row->status, SmsMessage::OUTCOMES, true) ? $row->status : 'pending';
            $out[$id][$status] += (int) $row->n;
            if ($status === 'sent') {
                $out[$id]['segments'] += (int) $row->parts;
            }
            if ($row->last !== null && ($out[$id]['last'] === null || (string) $row->last > $out[$id]['last'])) {
                $out[$id]['last'] = (string) $row->last;
            }
        }

        return $out;
    }

    /**
     * Queue the job. When the queue refuses it, nothing was queued: the campaign goes back to what it was (`$back`: a
     * draft, or scheduled for the next run) — only while no member was recorded. A synchronous queue (local
     * development) runs the job here, and one that stopped partway has already recorded members, so the campaign stays
     * as the job left it.
     *
     * @param list<int> $ids
     */
    private function handOver(SmsCampaign $c, array $ids, string $back): bool
    {
        try {
            SendSmsCampaignChunk::dispatch((int) $c->id, $ids);
        } catch (\Throwable $e) {
            Log::error('loyalty SMS campaign could not be queued', ['campaign_id' => $c->id, 'error' => $e->getMessage()]);
            $undo = $back === SmsMessage::STATUS_DRAFT
                ? ['status' => SmsMessage::STATUS_DRAFT, 'sent_by_user_id' => null, 'recipient_count' => 0]
                : ['status' => SmsMessage::STATUS_SCHEDULED, 'recipient_count' => 0];
            $reverted = SmsMessage::query()->whereKey($c->id)->where('status', SmsMessage::STATUS_SENDING)
                ->whereNotExists(fn ($q) => $q->from('sms_campaign_deliveries')->where('sms_campaign_deliveries.campaign_id', (int) $c->id))
                ->update($undo);

            return $reverted !== 1;
        }

        return true;
    }

    /** Who scheduled it: the causer of what the scheduler does for them. */
    private static function scheduler(SmsCampaign $c): ?User
    {
        return $c->sent_by_user_id ? User::query()->find($c->sent_by_user_id) : null;
    }

    private static function alreadyStarted(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('already_started', 'This campaign was already started.', 409, ['status' => $status]);
    }

    private static function changed(): LoyaltyRefused
    {
        return new LoyaltyRefused('changed', 'This campaign changed since it was shown. Check it and send again.', 409);
    }
}
