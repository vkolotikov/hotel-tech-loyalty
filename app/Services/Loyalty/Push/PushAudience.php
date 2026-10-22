<?php

namespace App\Services\Loyalty\Push;

use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Services\MemberSegmentService;
use App\Services\NotificationService;

/**
 * Who a push message to a segment would reach (spec 2026-10-22 release 3 §5), decided member by member by the same
 * rules the job pushes by (NotificationService::canPush and ::optsOut): the segment's active members
 * (MemberSegmentService) with push switched on, a device token, and the message's category not switched off. The rest
 * are counted by why, in three buckets that do not overlap, in this order: push switched off, no device, the category
 * opted out.
 *
 * No SQL here the tests' SQLite cannot run, and no join onto the segment's query: the shared service writes its
 * columns unqualified.
 */
final class PushAudience
{
    private const CHUNK = 500;

    public function __construct(private readonly MemberSegmentService $segments)
    {
    }

    /**
     * @return array{members: int, reached: list<int>, push_off: int, no_device: int, opted_out: int}
     *   `reached` is the members' ids in ascending order.
     */
    public function of(MemberSegment $segment, string $category): array
    {
        $base = $this->segments->buildQuery(is_array($segment->definition) ? $segment->definition : []);

        $members = 0;
        $reached = [];
        $pushOff = 0;
        $noDevice = 0;
        $optedOut = 0;
        (clone $base)
            ->select(['loyalty_members.id', 'loyalty_members.push_notifications', 'loyalty_members.expo_push_token', 'loyalty_members.notification_preferences'])
            ->chunkById(self::CHUNK, function ($rows) use ($category, &$members, &$reached, &$pushOff, &$noDevice, &$optedOut) {
                /** @var LoyaltyMember $m */
                foreach ($rows as $m) {
                    $members++;
                    if (!NotificationService::canPush($m)) {
                        $m->push_notifications ? $noDevice++ : $pushOff++;
                    } elseif (NotificationService::optsOut($m->notification_preferences, $category)) {
                        $optedOut++;
                    } else {
                        $reached[] = (int) $m->id;
                    }
                }
            }, 'loyalty_members.id', 'id');

        sort($reached);

        return [
            'members'   => $members,
            'reached'   => $reached,
            'push_off'  => $pushOff,
            'no_device' => $noDevice,
            'opted_out' => $optedOut,
        ];
    }
}
