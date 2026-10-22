<?php

namespace App\Services\Loyalty\Push;

use App\Jobs\SendPushMessageChunk;
use App\Models\AuditLog;
use App\Models\MemberSegment;
use App\Models\NotificationCampaign;
use App\Models\User;
use App\Services\Loyalty\Campaigns\SegmentRules;
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

        try {
            SendPushMessageChunk::dispatch((int) $m->id, $ids);
        } catch (\Throwable $e) {
            Log::error('loyalty push message could not be queued', ['campaign_id' => $m->id, 'error' => $e->getMessage()]);
            // Nothing was queued: hand the draft back rather than leave it "sending" with no job behind it — only while
            // no member was recorded. A synchronous queue (local development) runs the job here, and one that stopped
            // partway has already recorded members, so the message stays as the job left it.
            $back = PushMessage::query()->whereKey($m->id)->where('status', PushMessage::STATUS_SENDING)
                ->whereNotExists(fn ($q) => $q->from('push_message_deliveries')->where('push_message_deliveries.campaign_id', (int) $m->id))
                ->update(['status' => PushMessage::STATUS_DRAFT, 'sent_by_user_id' => null, 'target_count' => 0]);
            if ($back === 1) {
                throw new LoyaltyRefused('not_started', 'The message could not be queued. Nothing was sent.', 503);
            }
        }

        $audience['segment']->forceFill(['last_sent_at' => now()])->save();
        $fresh = PushMessage::query()->findOrFail($m->id);
        AuditLog::record('push_message_queued', $fresh,
            ['recipients' => $count, 'segment_id' => (int) $m->member_segment_id, 'category' => (string) $m->category], [], $by,
            "Push message '{$fresh->name}' queued for {$count} members");

        return $fresh;
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
