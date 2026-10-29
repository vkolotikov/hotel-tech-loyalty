<?php

namespace App\Services\Loyalty;

use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use App\Models\User;
use App\Scopes\BrandScope;
use App\Services\Loyalty\Visits\VisitEffects;
use App\Services\LoyaltyService;
use Illuminate\Support\Facades\DB;

/**
 * A member's points ledger in HexaTech Loyalty (spec 2026-10-21 §4.3): the
 * whole of it, every brand's lines (the balance is the member's, not a
 * brand's), still only this organisation's; and the rules a reversal keeps on
 * top of LoyaltyService::reverseTransaction(), which does the writing.
 */
final class MemberLedger
{
    public const PER_PAGE = 25;

    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    /** @return array{lines: list<array<string, mixed>>, page: int, pages: int, total: int} */
    public function page(LoyaltyMember $member, int $page, string $type = 'all'): array
    {
        $query = $this->lines($member)->orderByDesc('created_at')->orderByDesc('id');
        if (in_array($type, ['earn', 'bonus', 'adjust', 'redeem', 'expire', 'reverse', 'referral'], true)) {
            $query->where('type', $type);
        }
        $total = (clone $query)->count();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, $page), $pages);
        $rows = $query->forPage($page, self::PER_PAGE)->get();

        // Who did it, in one read for the page.
        $names = User::query()->whereIn('id', $rows->pluck('staff_id')->filter()->unique()->values())->pluck('name', 'id');

        return [
            'lines' => $rows->map(fn (PointsTransaction $t) => self::line($t, $names[$t->staff_id] ?? null))->values()->all(),
            'page'  => $page,
            'pages' => $pages,
            'total' => $total,
        ];
    }

    /**
     * Undo one of the member's lines. It must be theirs, not a reversal itself, and not reversed already; the check
     * is made again under the row's lock by the service.
     *
     * Release 7: a line of a desk visit (DeskVisit's check-in or purchase line, referenced `scan_event` + the visit's
     * row) commits a durable reversal intent with the points and undoes the visit once the locks are released: its stamp comes off an
     * open card, its cashback goes back (never below zero), its tier spend is taken back. Each of those is idempotent,
     * so reversing the visit's other line as well changes nothing more.
     */
    public function reverse(LoyaltyMember $member, int $lineId, string $reason, User $by): PointsTransaction
    {
        $visitIntent = null;
        $reversal = DB::transaction(function () use ($member, $lineId, $reason, $by, &$visitIntent) {
            $line = $this->lines($member)->whereKey($lineId)->lockForUpdate()->first();
            if (!$line) {
                throw LoyaltyRefused::notFound();
            }
            if (self::isRewardDebit($line)) {
                throw new LoyaltyRefused('cannot_reverse', 'Cancel the reward redemption to refund its points and stock together.', 409);
            }
            if (self::isReversal($line)) {
                throw new LoyaltyRefused('cannot_reverse', 'A reversal cannot be reversed.', 409);
            }
            if ($line->is_reversed) {
                throw new LoyaltyRefused('already_reversed', 'This line was already reversed.', 409);
            }
            // This transaction holds the line's lock, so the service's own re-check sees what was checked here.
            $reversal = $this->loyalty->reverseTransaction($line, $reason, $by);
            if ($line->reference_type === 'scan_event' && $line->reference_id !== null) {
                $visitIntent = app(VisitEffects::class)->reverse((int) $member->organization_id, 'scan_event', (int) $line->reference_id, $by);
            }
            return $reversal;
        });

        if ($visitIntent !== null) {
            // The intent commits with points. Run effects only after any caller's outer transaction releases its locks.
            DB::afterCommit(fn () => app(VisitEffects::class)->run($visitIntent));
        }

        return $reversal;
    }

    /** A line as the history shows it. @return array<string, mixed> */
    public static function line(PointsTransaction $t, ?string $by): array
    {
        return [
            'id'             => (int) $t->id,
            'type'           => (string) $t->type,
            'points'         => (int) $t->points,
            'balance_after'  => $t->balance_after !== null ? (int) $t->balance_after : null,
            'description'    => (string) ($t->description ?? ''),
            'by'             => $by,
            'at'             => $t->created_at?->toIso8601String(),
            'is_reversed'    => (bool) $t->is_reversed,
            'reversal_of_id' => $t->reversal_of_id !== null ? (int) $t->reversal_of_id : null,
            'can_reverse'    => !$t->is_reversed && !self::isReversal($t) && !self::isRewardDebit($t),
        ];
    }

    private static function isReversal(PointsTransaction $t): bool
    {
        return $t->type === 'reverse' || $t->reversal_of_id !== null;
    }

    /** Reward value and stock must move together through RedemptionActions::cancel(). */
    private static function isRewardDebit(PointsTransaction $t): bool
    {
        return (int) $t->points < 0 && ($t->reason_code === 'catalog_redeem'
            || str_starts_with((string) $t->idempotency_key, 'reward_redemption_'));
    }

    /** The member's lines in every brand; the tenant scope still holds. */
    private function lines(LoyaltyMember $member)
    {
        return PointsTransaction::withoutGlobalScope(BrandScope::class)->where('member_id', $member->id);
    }
}
