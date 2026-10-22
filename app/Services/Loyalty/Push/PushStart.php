<?php

namespace App\Services\Loyalty\Push;

use App\Jobs\SendPushMessageChunk;
use App\Models\AuditLog;
use App\Models\MemberSegment;
use App\Models\NotificationCampaign;
use App\Models\User;
use App\Services\Loyalty\Campaigns\SegmentRules;
use App\Services\Loyalty\Campaigns\SendLater;
use App\Services\Loyalty\LoyaltyRefused;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Starting a push message (spec 2026-10-22 release 3 §5), with the once-only rules of email (Campaigns\CampaignStart):
 *
 * - the members handed to the job are the ones the confirmation counted (PushAudience: active segment members with
 *   push switched on, a device, the category not opted out), in id order; the job checks each one again;
 * - the count the person confirmed and the draft they saw (`revision`) must still be true, or nothing starts
 *   (`audience_changed`, `changed`);
 * - one conditional UPDATE (`draft` → `sending`, on this organisation's push message with the content that was
 *   checked) starts it, so two presses cannot start it twice: the second hears `already_started` and dispatches
 *   nothing;
 * - an audience over the cap is refused, not cut.
 *
 * Release 4 (§5): send later, as for email (Campaigns\CampaignStart, Campaigns\SendLater): `schedule()` sets a draft to
 * `scheduled` (`scheduled_at`, the column notification_campaigns always had, and `sent_by_user_id` naming who
 * scheduled it), `unschedule()` takes it back, and `startScheduled()` starts it once when it is due, to whoever can
 * receive it then. A scheduled message that cannot start is marked failed with the reason in `data.schedule_problem`.
 */
final class PushStart
{
    public function __construct(private readonly PushAudience $audience)
    {
    }

    /**
     * Who the message would reach now.
     *
     * @return array{segment: MemberSegment, members: int, reached: list<int>, push_off: int, no_device: int, opted_out: int}
     * @throws LoyaltyRefused `no_audience` without a segment of this organisation, `no_category` without a category,
     *   `bad_rule` when the segment's rules have a problem
     */
    public function audienceOf(NotificationCampaign $m): array
    {
        $segment = $m->member_segment_id ? MemberSegment::query()->find($m->member_segment_id) : null;
        if (!$segment) {
            throw new LoyaltyRefused('no_audience', 'Choose a segment for this message first.', 422);
        }
        if (!PushMessage::isCategory($m->category)) {
            throw new LoyaltyRefused('no_category', 'Choose what kind of message this is first.', 422);
        }
        SegmentRules::assertSound($segment->definition);

        return ['segment' => $segment] + $this->audience->of($segment, (string) $m->category);
    }

    /**
     * @param int $confirmed the number of members the person was told it would reach
     * @param string $revision the draft's `updated_at` as the page showed it
     * @throws LoyaltyRefused
     */
    public function start(NotificationCampaign $m, User $by, int $confirmed, string $revision): NotificationCampaign
    {
        if ($m->status !== PushMessage::STATUS_DRAFT) {
            throw self::alreadyStarted((string) $m->status);
        }
        if ($revision !== PushMessage::revision($m)) {
            throw self::changed();
        }
        $missing = PushMessage::incomplete($m);
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This message is not ready to send.', 422, ['missing' => $missing]);
        }

        $audience = $this->audienceOf($m);
        $ids = $audience['reached'];
        $count = count($ids);
        if ($count === 0) {
            throw new LoyaltyRefused('nobody_to_send_to', 'No member of this segment can receive it.', 422);
        }
        if ($count > PushMessage::LIMIT) {
            throw new LoyaltyRefused('too_many', 'This audience is larger than one message may reach.', 422, ['limit' => PushMessage::LIMIT, 'reached' => $count]);
        }
        if ($count !== $confirmed) {
            throw new LoyaltyRefused('audience_changed', 'The number of members it would reach has changed.', 409, ['reached' => $count]);
        }

        // The one write that starts it: only this organisation's push message, only while it is the draft checked.
        $started = PushMessage::query()
            ->whereKey($m->id)
            ->where('organization_id', $m->organization_id)
            ->where('status', PushMessage::STATUS_DRAFT)
            ->where('member_segment_id', $m->member_segment_id)
            ->where('category', $m->category)
            ->where('title', $m->title)
            ->where('body', $m->body)
            ->update([
                'status'          => PushMessage::STATUS_SENDING,
                'sent_by_user_id' => $by->id,
                'target_count'    => $count,
                'sent_count'      => 0,
                'sent_at'         => null,
            ]);
        if ($started !== 1) {
            $now = PushMessage::query()->find($m->id);
            throw $now && $now->status !== PushMessage::STATUS_DRAFT ? self::alreadyStarted((string) $now->status) : self::changed();
        }

        if (!$this->handOver($m, $ids, PushMessage::STATUS_DRAFT)) {
            throw new LoyaltyRefused('not_started', 'The message could not be queued. Nothing was sent.', 503);
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = PushMessage::query()->findOrFail($m->id);
        AuditLog::record('push_message_queued', $fresh,
            ['recipients' => $count, 'segment_id' => (int) $m->member_segment_id, 'category' => (string) $m->category], [], $by,
            "Push message '{$fresh->name}' queued for {$count} members");

        return $fresh;
    }

    /**
     * Send later (release 4 §5): a draft set to go out at a time on the venue's clock, or a scheduled one moved. The
     * draft is checked as Send checks it (the revision shown, nothing missing, a segment and a category, sound rules),
     * but no count is confirmed: it goes to whoever can receive it when it starts.
     *
     * @param string $sendAt the venue's wall clock, `YYYY-MM-DDTHH:mm`
     * @return array{push: NotificationCampaign, about: int} `about`: how many it would reach now
     */
    public function schedule(NotificationCampaign $m, User $by, string $sendAt, string $revision): array
    {
        $orgId = (int) $m->organization_id;
        if (!in_array($m->status, [PushMessage::STATUS_DRAFT, SendLater::STATUS], true)) {
            throw self::alreadyStarted((string) $m->status);
        }
        if ($revision !== PushMessage::revision($m)) {
            throw self::changed();
        }
        $at = SendLater::instantOf($sendAt, $orgId);
        $missing = PushMessage::incomplete($m);
        if ($missing !== []) {
            throw new LoyaltyRefused('incomplete', 'This message is not ready to send.', 422, ['missing' => $missing]);
        }
        $about = count($this->audienceOf($m)['reached']);
        $was = (string) $m->status;
        $before = $m->scheduled_at?->toIso8601String();

        $query = PushMessage::query()->whereKey($m->id)->where('organization_id', $orgId)->where('status', $was);
        if ($was === PushMessage::STATUS_DRAFT) {
            $query->where('member_segment_id', $m->member_segment_id)->where('category', $m->category)->where('title', $m->title)->where('body', $m->body);
        }
        $set = $query->update([
            'status'          => SendLater::STATUS,
            'scheduled_at'    => $at,
            'sent_by_user_id' => $by->id,
            'target_count'    => 0,
            'sent_count'      => 0,
        ]);
        if ($set !== 1) {
            $now = PushMessage::query()->find($m->id);
            throw $now && !in_array($now->status, [PushMessage::STATUS_DRAFT, SendLater::STATUS], true) ? self::alreadyStarted((string) $now->status) : self::changed();
        }

        $fresh = PushMessage::query()->findOrFail($m->id);
        AuditLog::record($was === SendLater::STATUS ? 'push_message_rescheduled' : 'push_message_scheduled', $fresh,
            ['send_at' => $at->toIso8601String(), 'send_at_venue' => SendLater::wallOf($at, $orgId), 'about' => $about, 'segment_id' => (int) $m->member_segment_id],
            $was === SendLater::STATUS ? ['send_at' => $before] : [], $by,
            "Push message '{$fresh->name}' scheduled for " . SendLater::wallOf($at, $orgId) . " (venue time), about {$about} members now");

        return ['push' => $fresh, 'about' => $about];
    }

    /** A scheduled message back to a draft: nothing is sent. @throws LoyaltyRefused `not_scheduled` */
    public function unschedule(NotificationCampaign $m, User $by): NotificationCampaign
    {
        $back = PushMessage::query()->whereKey($m->id)->where('organization_id', $m->organization_id)->where('status', SendLater::STATUS)
            ->update(['status' => PushMessage::STATUS_DRAFT, 'scheduled_at' => null, 'sent_by_user_id' => null]);
        if ($back !== 1) {
            throw SendLater::notScheduled((string) (PushMessage::query()->find($m->id)?->status ?? ''));
        }

        $fresh = PushMessage::query()->findOrFail($m->id);
        AuditLog::record('push_message_unscheduled', $fresh, ['status' => PushMessage::STATUS_DRAFT],
            ['status' => SendLater::STATUS, 'send_at' => $m->scheduled_at?->toIso8601String()], $by,
            "Push message '{$fresh->name}' taken back to a draft; nothing was sent");

        return $fresh;
    }

    /**
     * Start a scheduled message that is due (`loyalty:send-scheduled`), to whoever can receive it now, with one
     * conditional update (`scheduled` → `sending`). One that cannot start is marked failed with the reason; one that
     * another run started, or someone moved or took back meanwhile, is left.
     *
     * @return string `started`, `left`, `not_started` (the queue refused it; it stays scheduled), or the reason's code
     */
    public function startScheduled(NotificationCampaign $m): string
    {
        if ($m->status !== SendLater::STATUS || $m->scheduled_at === null || $m->scheduled_at->isFuture()) {
            return 'left';
        }

        try {
            SendLater::assertStillAllowed((int) $m->organization_id, 'push_notifications');
            if (PushMessage::incomplete($m) !== []) {
                throw new LoyaltyRefused('incomplete', '', 422);
            }
            $audience = $this->audienceOf($m);
            $ids = $audience['reached'];
            if ($ids === []) {
                throw new LoyaltyRefused('nobody_to_send_to', '', 422);
            }
            if (count($ids) > PushMessage::LIMIT) {
                throw new LoyaltyRefused('too_many', '', 422);
            }
        } catch (LoyaltyRefused $e) {
            $failed = PushMessage::query()->whereKey($m->id)->where('status', SendLater::STATUS)
                ->update(['status' => PushMessage::STATUS_FAILED, 'data' => json_encode(['schedule_problem' => $e->errorCode])]);
            if ($failed === 1) {
                AuditLog::record('push_message_schedule_failed', $m, ['reason' => $e->errorCode], ['status' => SendLater::STATUS],
                    self::scheduler($m), "Push message '{$m->name}' was due but did not start: {$e->errorCode}");
            }

            return $failed === 1 ? $e->errorCode : 'left';
        }
        $count = count($ids);

        $started = PushMessage::query()
            ->whereKey($m->id)
            ->where('organization_id', $m->organization_id)
            ->where('status', SendLater::STATUS)
            ->where('scheduled_at', '<=', now())
            ->where('member_segment_id', $m->member_segment_id)
            ->where('category', $m->category)
            ->where('title', $m->title)
            ->where('body', $m->body)
            ->update(['status' => PushMessage::STATUS_SENDING, 'target_count' => $count, 'sent_count' => 0, 'sent_at' => null]);
        if ($started !== 1) {
            return 'left';
        }
        if (!$this->handOver($m, $ids, SendLater::STATUS)) {
            return 'not_started';
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = PushMessage::query()->findOrFail($m->id);
        AuditLog::record('push_message_queued', $fresh,
            ['recipients' => $count, 'segment_id' => (int) $m->member_segment_id, 'category' => (string) $m->category, 'scheduled' => true], [],
            self::scheduler($m), "Scheduled push message '{$fresh->name}' queued for {$count} members");

        return 'started';
    }

    /**
     * Queue the job. When the queue refuses it, nothing was queued: the message goes back to what it was (`$back`: a
     * draft, or scheduled for the next run) rather than stay "sending" with no job behind it — only while no member
     * was recorded. A synchronous queue (local development) runs the job here, and one that stopped partway has
     * already recorded members, so the message stays as the job left it.
     *
     * @param list<int> $ids
     */
    private function handOver(NotificationCampaign $m, array $ids, string $back): bool
    {
        try {
            SendPushMessageChunk::dispatch((int) $m->id, $ids);
        } catch (\Throwable $e) {
            Log::error('loyalty push message could not be queued', ['campaign_id' => $m->id, 'error' => $e->getMessage()]);
            $undo = $back === PushMessage::STATUS_DRAFT
                ? ['status' => PushMessage::STATUS_DRAFT, 'sent_by_user_id' => null, 'target_count' => 0]
                : ['status' => SendLater::STATUS, 'target_count' => 0];
            $reverted = PushMessage::query()->whereKey($m->id)->where('status', PushMessage::STATUS_SENDING)
                ->whereNotExists(fn ($q) => $q->from('push_message_deliveries')->where('push_message_deliveries.campaign_id', (int) $m->id))
                ->update($undo);

            return $reverted !== 1;
        }

        return true;
    }

    /** Who scheduled it: the causer of what the scheduler does for them. */
    private static function scheduler(NotificationCampaign $m): ?User
    {
        return $m->sent_by_user_id ? User::query()->find($m->sent_by_user_id) : null;
    }

    /**
     * How far a message got, from its delivery rows: each outcome counted once per member.
     *
     * @param list<int> $ids
     * @return array<int, array{sent: int, failed: int, inbox_only: int, skipped: int, pending: int, last: ?string}>
     */
    public static function resultsOf(array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[(int) $id] = array_fill_keys(PushMessage::OUTCOMES, 0) + ['last' => null];
        }
        if ($ids === []) {
            return $out;
        }
        $rows = DB::table('push_message_deliveries')
            ->whereIn('campaign_id', $ids)
            ->groupBy('campaign_id', 'status')
            ->select('campaign_id', 'status', DB::raw('COUNT(*) AS n'), DB::raw('MAX(updated_at) AS last'))
            ->get();
        foreach ($rows as $row) {
            $id = (int) $row->campaign_id;
            $status = in_array($row->status, PushMessage::OUTCOMES, true) ? $row->status : 'pending';
            $out[$id][$status] += (int) $row->n;
            if ($row->last !== null && ($out[$id]['last'] === null || (string) $row->last > $out[$id]['last'])) {
                $out[$id]['last'] = (string) $row->last;
            }
        }

        return $out;
    }

    private static function alreadyStarted(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('already_started', 'This message was already started.', 409, ['status' => $status]);
    }

    private static function changed(): LoyaltyRefused
    {
        return new LoyaltyRefused('changed', 'This message changed since it was shown. Check it and send again.', 409);
    }
}
