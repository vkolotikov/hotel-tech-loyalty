<?php

namespace App\Services\Loyalty;

use App\Models\AuditLog;
use App\Models\BenefitEntitlement;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The benefit requests members send from the app (`benefit_entitlements`),
 * as HexaTech Loyalty's queue (spec 2026-10-21 §4.4). Waiting is `pending`
 * (asked by the member) and `eligible` (offered by the programme); a waiting
 * request is approved or declined, an approved one marked done or declined.
 * Each step reads the row again under its lock, so two people pressing at
 * once act once and the second hears `wrong_state`. The writing is the
 * model's own (`approve`, `fulfill`, `decline`), as the full admin's.
 */
final class RequestQueue
{
    public const PER_PAGE = 25;
    public const WAITING = ['pending', 'eligible'];
    /** The workspace's tabs and the states each holds. */
    public const TABS = [
        'waiting'  => self::WAITING,
        'approved' => ['approved'],
        'done'     => ['fulfilled', 'declined', 'cancelled'],
    ];

    /** @return array{requests: list<array<string, mixed>>, page: int, pages: int, total: int, counts: array<string, int>} */
    public function page(string $tab, int $page, ?int $memberId = null, ?int $requestId = null): array
    {
        $states = self::TABS[$tab] ?? self::WAITING;
        $query = BenefitEntitlement::query()
            ->with(['member.user:id,name,email', 'benefit:id,name,code,category,fulfillment_mode'])
            ->when($requestId, fn ($q) => $q->whereKey($requestId), fn ($q) => $q->whereIn('status', $states))
            ->when($memberId, fn ($q) => $q->where('member_id', $memberId))
            ->orderByDesc('created_at')->orderByDesc('id');

        $total = (clone $query)->count();
        if ($requestId && $total === 0) throw LoyaltyRefused::notFound();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, $page), $pages);

        return [
            'requests' => $query->forPage($page, self::PER_PAGE)->get()->map(fn (BenefitEntitlement $e) => self::row($e))->values()->all(),
            'page'     => $page,
            'pages'    => $pages,
            'total'    => $total,
            'counts'   => collect(self::TABS)->map(fn (array $s) => BenefitEntitlement::query()->whereIn('status', $s)
                ->when($memberId, fn ($q) => $q->where('member_id', $memberId))->count())->all(),
        ];
    }

    public function approve(int $id, User $by): BenefitEntitlement
    {
        return $this->step($id, self::WAITING, fn (BenefitEntitlement $e) => $e->approve($by), 'benefit_request_approved', $by);
    }

    public function done(int $id, User $by): BenefitEntitlement
    {
        return $this->step($id, ['approved'], fn (BenefitEntitlement $e) => $e->fulfill($by), 'benefit_request_fulfilled', $by);
    }

    public function decline(int $id, User $by, string $reason): BenefitEntitlement
    {
        return $this->step($id, [...self::WAITING, 'approved'], fn (BenefitEntitlement $e) => $e->decline($by, $reason), 'benefit_request_declined', $by);
    }

    /** A request as the queue and the member's page show it. @return array<string, mixed> */
    public static function row(BenefitEntitlement $e): array
    {
        return [
            'id'             => (int) $e->id,
            'state'          => (string) $e->status,
            'member'         => $e->member ? ['id' => (int) $e->member->id, 'name' => (string) ($e->member->user?->name ?? ''), 'member_number' => $e->member->member_number] : null,
            'benefit'        => $e->benefit ? ['id' => (int) $e->benefit->id, 'name' => (string) $e->benefit->name, 'category' => $e->benefit->category] : null,
            'asked_at'       => ($e->requested_at ?? $e->created_at)?->toIso8601String(),
            'fulfilled_at'   => $e->fulfilled_at?->toIso8601String(),
            'decline_reason' => $e->decline_reason,
        ];
    }

    /** @param list<string> $from */
    private function step(int $id, array $from, callable $write, string $audit, User $by): BenefitEntitlement
    {
        return DB::transaction(function () use ($id, $from, $write, $audit, $by) {
            $row = BenefitEntitlement::query()->whereKey($id)->lockForUpdate()->first();
            if (!$row) {
                throw LoyaltyRefused::notFound();
            }
            if (!in_array($row->status, $from, true)) {
                throw new LoyaltyRefused('wrong_state', 'This request has moved on.', 409, ['state' => $row->status]);
            }
            $before = $row->status;
            $write($row);
            AuditLog::record($audit, $row, ['status' => $row->status], ['status' => $before], $by);

            return $row->fresh(['member.user:id,name,email', 'benefit:id,name,code,category,fulfillment_mode']);
        });
    }
}
