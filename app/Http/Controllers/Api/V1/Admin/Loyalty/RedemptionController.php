<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\RewardRedemption;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Loyalty\RedemptionActions;
use App\Services\Loyalty\RedemptionStateException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reward redemptions (spec 2026-10-21 §4.6): the codes members show at the
 * desk. Everyone reads the list; fulfilling and cancelling need
 * `can_redeem_points` (§5) and are RedemptionActions', the writer the full
 * admin calls too, so both addresses give the same answers. The workspace
 * sends no notes, so a row keeps its own.
 */
class RedemptionController extends Controller
{
    public const PER_PAGE = 25;
    /** The tabs and the states each holds; `all` is every state. */
    public const TABS = [
        'pending' => [RewardRedemption::STATUS_PENDING],
        'done'    => [RewardRedemption::STATUS_FULFILLED, RewardRedemption::STATUS_CANCELLED],
        'all'     => null,
    ];

    public function index(Request $request): JsonResponse
    {
        $tab = (string) $request->query('state', 'pending');
        $data = $request->validate(['request' => 'sometimes|integer|min:1']);
        $selected = isset($data['request']) ? (int) $data['request'] : null;
        $states = array_key_exists($tab, self::TABS) ? self::TABS[$tab] : self::TABS['pending'];
        $query = RewardRedemption::query()
            ->with(['reward:id,name', 'member.user:id,name'])
            ->when($selected, fn ($q) => $q->whereKey($selected), fn ($q) => $q->when($states !== null, fn ($q) => $q->whereIn('status', $states)))
            ->orderByDesc('created_at')->orderByDesc('id');

        $total = (clone $query)->count();
        if ($selected && $total === 0) throw LoyaltyRefused::notFound();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, (int) $request->query('page', 1)), $pages);

        return response()->json([
            'redemptions' => $query->forPage($page, self::PER_PAGE)->get()->map(fn (RewardRedemption $r) => self::row($r))->values(),
            'page'        => $page,
            'pages'       => $pages,
            'total'       => $total,
            'counts'      => ['pending' => RewardRedemption::query()->where('status', RewardRedemption::STATUS_PENDING)->count()],
        ]);
    }

    public function fulfil(Request $request, int $id, RedemptionActions $actions): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::REDEEM);
        $this->ours($id);

        try {
            $row = $actions->fulfil($id, $request->user(), false);
        } catch (RedemptionStateException $e) {
            throw self::wrongState($id, $e);
        }

        return response()->json(['redemption' => self::row($row->fresh(['reward', 'member.user']))]);
    }

    /** A pending redemption's points go back through the ledger (the debit reversed); a fulfilled one's do not. */
    public function cancel(Request $request, int $id, RedemptionActions $actions): JsonResponse
    {
        LoyaltyAccess::require($request->user(), LoyaltyAccess::REDEEM);
        $this->ours($id);

        try {
            $row = $actions->cancel($id, $request->user(), false);
        } catch (RedemptionStateException $e) {
            throw self::wrongState($id, $e);
        }

        return response()->json(['redemption' => self::row($row->fresh(['reward', 'member.user']))]);
    }

    /** @return array<string, mixed> */
    private static function row(RewardRedemption $r): array
    {
        return [
            'id'           => (int) $r->id,
            'code'         => (string) $r->code,
            'state'        => (string) $r->status,
            'points'       => (int) $r->points_spent,
            'reward'       => $r->reward ? ['id' => (int) $r->reward->id, 'name' => (string) $r->reward->name] : null,
            'member'       => $r->member ? ['id' => (int) $r->member->id, 'name' => (string) ($r->member->user?->name ?? ''), 'member_number' => $r->member->member_number] : null,
            'at'           => $r->created_at?->toIso8601String(),
            'fulfilled_at' => $r->fulfilled_at?->toIso8601String(),
            'cancelled_at' => $r->cancelled_at?->toIso8601String(),
        ];
    }

    /** This organisation's redemption (the tenant scope), asked before the shared writer runs, or 404. */
    private function ours(int $id): void
    {
        if (!RewardRedemption::query()->whereKey($id)->exists()) {
            throw LoyaltyRefused::notFound();
        }
    }

    /** It has moved on (fulfilled, or cancelled already): 409 with where it stands now. */
    private static function wrongState(int $id, RedemptionStateException $e): LoyaltyRefused
    {
        return new LoyaltyRefused('wrong_state', $e->getMessage(), 409, ['state' => RewardRedemption::query()->whereKey($id)->value('status')]);
    }
}
