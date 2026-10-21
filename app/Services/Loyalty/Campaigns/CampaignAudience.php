<?php

namespace App\Services\Loyalty\Campaigns;

use App\Models\EmailSuppression;
use App\Models\MemberSegment;
use App\Models\User;
use App\Services\EmailComplianceService;
use App\Services\MemberSegmentService;

/**
 * Who a campaign to a segment would email, counted the way the pipeline sends (spec 2026-10-21 release 2 §6):
 * SendEmailCampaignChunk mails the members it is handed that EmailComplianceService::scopeEligible() lets through
 * (agreed to marketing, emails switched on, not unsubscribed), at their user's address, and the MessageSending
 * listener then cancels a send to a suppressed address (BlockSuppressedRecipients: a platform-wide row or one of
 * this organisation's, a soft bounce only past its limit). So the members reached are the segment's active members
 * (MemberSegmentService), narrowed by the compliance service's own scope, with an address, not suppressed —
 * the suppression decided by EmailSuppression::isSuppressed() itself. The rest are counted by why, in four
 * buckets that do not overlap.
 *
 * No SQL here the tests' SQLite cannot run, and no join onto the segment's query: the shared service writes its
 * columns unqualified.
 */
final class CampaignAudience
{
    /**
     * The most members one campaign is handed: the full admin's own cap (MemberSegmentService::memberIds,
     * `member_ids max:5000`). The full admin cuts a larger audience silently; the workspace refuses it instead.
     */
    public const LIMIT = 5000;

    private const CHUNK = 500;

    public function __construct(
        private readonly MemberSegmentService $segments,
        private readonly EmailComplianceService $compliance,
    ) {
    }

    /**
     * @return array{members: int, reached: list<int>, unsubscribed: int, no_consent: int, no_email: int, suppressed: int}
     *   `reached` is the members' ids in ascending order.
     */
    public function of(MemberSegment $segment, int $orgId): array
    {
        $base = $this->segments->buildQuery(is_array($segment->definition) ? $segment->definition : []);
        $members = (clone $base)->count();
        $unsubscribed = (clone $base)->whereNotNull('unsubscribed_at')->count();
        $eligible = $this->compliance->scopeEligible(clone $base, 'marketing');
        $eligibleCount = (clone $eligible)->count();

        $reached = [];
        $noEmail = 0;
        $suppressed = 0;
        (clone $eligible)->select(['loyalty_members.id', 'loyalty_members.user_id'])
            ->chunkById(self::CHUNK, function ($rows) use ($orgId, &$reached, &$noEmail, &$suppressed) {
                $emails = User::query()->whereIn('id', $rows->pluck('user_id')->filter()->all())->pluck('email', 'id');
                $addresses = [];
                foreach ($rows as $row) {
                    $email = trim((string) ($emails[$row->user_id] ?? ''));
                    if ($email === '') {
                        $noEmail++;
                        continue;
                    }
                    $addresses[(int) $row->id] = $email;
                }
                $blocked = $this->suppressedAmong($addresses, $orgId);
                foreach ($addresses as $id => $email) {
                    if (isset($blocked[EmailSuppression::normalise($email)])) {
                        $suppressed++;
                    } else {
                        $reached[] = $id;
                    }
                }
            }, 'loyalty_members.id', 'id');

        sort($reached);

        return [
            'members'      => $members,
            'reached'      => $reached,
            'unsubscribed' => $unsubscribed,
            // Active, not unsubscribed, and not let through by the compliance scope: no marketing consent, or emails off.
            'no_consent'   => max(0, $members - $unsubscribed - $eligibleCount),
            'no_email'     => $noEmail,
            'suppressed'   => $suppressed,
        ];
    }

    /**
     * The addresses among these the listener would refuse, as a set of normalised addresses. One query finds every
     * row that could apply (this organisation's or platform-wide); the model's own rule then decides each.
     *
     * @param array<int, string> $addresses
     * @return array<string, true>
     */
    private function suppressedAmong(array $addresses, int $orgId): array
    {
        if ($addresses === []) {
            return [];
        }
        $normalised = array_values(array_unique(array_map(fn (string $e) => EmailSuppression::normalise($e), $addresses)));
        $candidates = EmailSuppression::query()
            ->whereIn('email', $normalised)
            ->where(fn ($q) => $q->whereNull('organization_id')->orWhere('organization_id', $orgId))
            ->pluck('email')->unique();

        $out = [];
        foreach ($candidates as $email) {
            if (EmailSuppression::isSuppressed((string) $email, $orgId)) {
                $out[(string) $email] = true;
            }
        }

        return $out;
    }
}
