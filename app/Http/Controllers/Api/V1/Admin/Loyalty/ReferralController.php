<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Referrals (spec 2026-10-21 §4.6): the numbers and the list, read only. The
 * rows are written when a member joins through another's code. The figures
 * are separate counts and sums, which PostgreSQL and the tests' SQLite both
 * run (the full admin's `FILTER (WHERE …)` is PostgreSQL's alone).
 */
class ReferralController extends Controller
{
    public const PER_PAGE = 25;

    public function index(Request $request): JsonResponse
    {
        $query = Referral::query()
            ->with(['referrer.user:id,name', 'referee.user:id,name'])
            ->orderByDesc('created_at')->orderByDesc('id');

        $total = (clone $query)->count();
        $pages = max(1, (int) ceil($total / self::PER_PAGE));
        $page = min(max(1, (int) $request->query('page', 1)), $pages);

        return response()->json([
            'figures'   => [
                'total'       => $total,
                'rewarded'    => Referral::query()->where('status', 'rewarded')->count(),
                'pending'     => Referral::query()->where('status', 'pending')->count(),
                'points_paid' => (int) Referral::query()->sum('referrer_points_awarded') + (int) Referral::query()->sum('referee_points_awarded'),
            ],
            'referrals' => $query->forPage($page, self::PER_PAGE)->get()->map(fn (Referral $r) => [
                'id'       => (int) $r->id,
                'referrer' => $r->referrer ? ['id' => (int) $r->referrer->id, 'name' => (string) ($r->referrer->user?->name ?? '')] : null,
                'referee'  => $r->referee ? ['id' => (int) $r->referee->id, 'name' => (string) ($r->referee->user?->name ?? '')] : null,
                'state'    => (string) $r->status,
                'points'   => ['referrer' => (int) $r->referrer_points_awarded, 'referee' => (int) $r->referee_points_awarded],
                'at'       => $r->created_at?->toIso8601String(),
            ])->values(),
            'page'      => $page,
            'pages'     => $pages,
            'total'     => $total,
        ]);
    }
}
