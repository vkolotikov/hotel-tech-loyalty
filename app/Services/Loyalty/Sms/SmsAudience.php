<?php

namespace App\Services\Loyalty\Sms;

use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Services\Email\CampaignTags;
use App\Services\MemberSegmentService;
use App\Services\Sms\PhoneNumber;
use App\Services\Sms\SmsText;

/**
 * Who an SMS campaign to a segment would text (release 4 §5, R4-4), decided member by member by the rules the job
 * sends by: the segment's active members (MemberSegmentService) who turned "Offers by SMS" on and whose user has a
 * phone number in international form (PhoneNumber). Two members with the same number are texted once (the one with
 * the lower id). The rest are counted by why, in four buckets that do not overlap, in this order: no SMS consent, no
 * phone number, a number without its country code, a number another member of the audience already has.
 *
 * With the text, it also counts the SMS parts the campaign would send — each member's copy with their own tags
 * filled, measured as the networks measure it (SmsText) — which is what Twilio bills.
 *
 * No SQL here the tests' SQLite cannot run, and no join onto the segment's query: the shared service writes its
 * columns unqualified.
 */
final class SmsAudience
{
    private const CHUNK = 500;

    public function __construct(private readonly MemberSegmentService $segments)
    {
    }

    /**
     * @return array{members: int, reached: list<int>, no_consent: int, no_phone: int, bad_phone: int, same_phone: int, segments: int}
     *   `reached` is the members' ids in ascending order; `segments` the SMS parts their copies come to (0 without a text).
     */
    public function of(MemberSegment $segment, string $text = '', string $venue = ''): array
    {
        $base = $this->segments->buildQuery(is_array($segment->definition) ? $segment->definition : []);

        $members = 0;
        $reached = [];
        $phones = [];
        $counts = ['no_consent' => 0, 'no_phone' => 0, 'bad_phone' => 0, 'same_phone' => 0];
        $parts = 0;
        (clone $base)
            ->select(['loyalty_members.id', 'loyalty_members.user_id', 'loyalty_members.tier_id', 'loyalty_members.sms_consent', 'loyalty_members.member_number',
                'loyalty_members.current_points', 'loyalty_members.lifetime_points', 'loyalty_members.referral_code'])
            ->with(['user:id,name,email,phone', 'tier:id,name'])
            ->chunkById(self::CHUNK, function ($rows) use ($text, $venue, &$members, &$reached, &$phones, &$counts, &$parts) {
                /** @var LoyaltyMember $m */
                foreach ($rows as $m) {
                    $members++;
                    $why = self::problemOf($m);
                    if ($why !== null) {
                        $counts[$why]++;
                        continue;
                    }
                    $phone = (string) PhoneNumber::e164($m->user?->phone);
                    if (isset($phones[$phone])) {
                        $counts['same_phone']++;
                        continue;
                    }
                    $phones[$phone] = true;
                    $reached[] = (int) $m->id;
                    if ($text !== '') {
                        $parts += SmsText::segments(SmsMessage::fill($text, CampaignTags::forMember($m, $venue)));
                    }
                }
            }, 'loyalty_members.id', 'id');

        sort($reached);

        return ['members' => $members, 'reached' => $reached] + $counts + ['segments' => $parts];
    }

    /**
     * Why this member cannot be texted now (`no_consent`, `no_phone`, `bad_phone`), or null when they can: the rule the
     * confirmation counts by and the job checks each member by again.
     */
    public static function problemOf(LoyaltyMember $m): ?string
    {
        if (!(bool) $m->sms_consent) {
            return 'no_consent';
        }

        return PhoneNumber::problem($m->user?->phone);
    }
}
