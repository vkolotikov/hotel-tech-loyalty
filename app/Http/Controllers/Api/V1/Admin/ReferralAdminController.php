<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyMember;
use App\Models\Referral;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin view onto the referral network.
 *
 *  - GET /v1/admin/referrals          → paginated list with referrer + referee
 *  - GET /v1/admin/referrals/stats    → headline numbers + top-referrer board
 *
 * Reads only — the actual referral row is created during member
 * registration. This controller exists so staff have visibility into
 * referral performance without having to query the DB by hand.
 */
class ReferralAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) min(100, max(10, (int) $request->input('per_page', 25)));

        $rows = Referral::with([
                'referrer:id,user_id,member_number,referral_code',
                'referrer.user:id,name,email',
                'referee:id,user_id,member_number,joined_at',
                'referee.user:id,name,email',
            ])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $s = '%' . trim((string) $request->input('search')) . '%';
                $q->where(function ($q) use ($s) {
                    $q->whereHas('referrer.user', fn ($qq) => $qq->where('name', 'ilike', $s)->orWhere('email', 'ilike', $s))
                      ->orWhereHas('referee.user', fn ($qq) => $qq->where('name', 'ilike', $s)->orWhere('email', 'ilike', $s));
                });
            })
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json($rows);
    }

    /**
     * Stats card: total referrals, points paid out, top referrers, recent
     * activity counts. One round-trip for the entire admin page header.
     */
    public function stats(): JsonResponse
    {
        $totals = Referral::query()
            ->selectRaw('
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = ?) AS rewarded,
                COUNT(*) FILTER (WHERE status = ?) AS pending,
                COALESCE(SUM(referrer_points_awarded), 0) AS referrer_points,
                COALESCE(SUM(referee_points_awarded), 0)  AS referee_points
            ', ['rewarded', 'pending'])
            ->first();

        $top = Referral::query()
            ->selectRaw('referrer_id, COUNT(*) AS count, COALESCE(SUM(referrer_points_awarded),0) AS points')
            ->groupBy('referrer_id')
            ->orderByDesc('count')
            ->limit(10)
            ->with([
                'referrer:id,user_id,member_number,referral_code',
                'referrer.user:id,name,email',
            ])
            ->get();

        $last30 = Referral::where('created_at', '>=', now()->subDays(30))->count();

        return response()->json([
            'total'             => (int) ($totals->total ?? 0),
            'rewarded'          => (int) ($totals->rewarded ?? 0),
            'pending'           => (int) ($totals->pending ?? 0),
            'referrer_points'   => (int) ($totals->referrer_points ?? 0),
            'referee_points'    => (int) ($totals->referee_points ?? 0),
            'last_30_days'      => $last30,
            'top_referrers'     => $top,
        ]);
    }
}
