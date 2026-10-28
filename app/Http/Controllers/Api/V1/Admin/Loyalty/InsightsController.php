<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\Insights\InsightsCohorts;
use App\Services\Loyalty\Insights\InsightsMoney;
use App\Services\Loyalty\Insights\InsightsPeriod;
use App\Services\Loyalty\Insights\LoyaltyInsights;
use App\Services\Loyalty\LoyaltyAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Insights (spec 2026-10-21 release 2 §5): how the programme is doing over 30
 * days, 90 days or 12 months, and the members gone quiet. For managers and
 * staff with `can_view_analytics` (the full admin's Analytics rule), checked
 * here as AccessMap only records outside `enforce`. The whole organisation,
 * every brand, on the venue's clock, never cached: the figures and their
 * definitions are LoyaltyInsights'.
 *
 * New members are counted by the day they joined (`joined_at`, else
 * `created_at`: what the members list shows as "Joined"), not by the day the
 * row was written as MemberDirectory's "new this month" is, so an import of
 * long-standing members does not read as a crowd of new ones.
 */
class InsightsController extends Controller
{
    /** Completed-day dashboard; the legacy reports keep their original inclusive-today periods. */
    public function report(Request $request): JsonResponse
    {
        LoyaltyAccess::requireInsights($request->user());
        $org = (int) app('current_organization_id');
        $last = InsightsPeriod::addDays(\App\Services\Appointments\VenueClock::today($org), -1);
        $input = $request->validate([
            'from' => ['nullable', 'required_with:to', 'date_format:Y-m-d', 'before_or_equal:to'],
            'to' => ['nullable', 'required_with:from', 'date_format:Y-m-d', 'before_or_equal:' . $last],
            'compare' => ['nullable', Rule::in(['previous', 'none'])],
            'tier_id' => ['nullable', 'integer', Rule::exists('loyalty_tiers', 'id')->where('organization_id', $org)],
        ]);
        $from = $input['from'] ?? InsightsPeriod::addDays($last, -27);
        $to = $input['to'] ?? $last;
        if (InsightsPeriod::daysBetween($from, $to) > 365) {
            throw \Illuminate\Validation\ValidationException::withMessages(['from' => ['Choose a period of at most 366 days.']]);
        }
        return response()->json((new \App\Services\Loyalty\Insights\InsightsReport($org, isset($input['tier_id']) ? (int) $input['tier_id'] : null))
            ->get($from, $to, ($input['compare'] ?? 'previous') === 'previous'));
    }

    /** `GET insights?period=30d|90d|12m` (30d when absent; anything else is a field error). */
    public function show(Request $request): JsonResponse
    {
        LoyaltyAccess::requireInsights($request->user());
        $request->validate(['period' => ['nullable', 'string', Rule::in(InsightsPeriod::CHOICES)]]);

        return response()->json(LoyaltyInsights::for(
            (int) app('current_organization_id'),
            (string) ($request->query('period') ?: InsightsPeriod::DEFAULT),
        ));
    }

    /**
     * `GET insights/cohorts` (release 4): members by the venue month they joined, the last twelve, and how many were
     * active in each month since (InsightsCohorts' definitions).
     */
    public function cohorts(Request $request): JsonResponse
    {
        LoyaltyAccess::requireInsights($request->user());

        return response()->json(InsightsCohorts::for((int) app('current_organization_id')));
    }

    /**
     * `GET insights/money?period=30d|90d|12m` (release 4): the money members brought in the period — paid stays and
     * appointments they booked, in the venue's currency — beside every booking's (InsightsMoney's definitions).
     */
    public function money(Request $request): JsonResponse
    {
        LoyaltyAccess::requireInsights($request->user());
        $request->validate(['period' => ['nullable', 'string', Rule::in(InsightsPeriod::CHOICES)]]);

        return response()->json(InsightsMoney::for(
            (int) app('current_organization_id'),
            (string) ($request->query('period') ?: InsightsPeriod::DEFAULT),
        ));
    }

    /** `GET insights/at-risk?days=7…365` (60 when absent): active members with no activity for that long. */
    public function atRisk(Request $request): JsonResponse
    {
        LoyaltyAccess::requireInsights($request->user());
        $request->validate(['days' => ['nullable', 'integer', 'min:7', 'max:365']]);

        return response()->json(LoyaltyInsights::atRisk(
            (int) app('current_organization_id'),
            $request->filled('days') ? (int) $request->query('days') : 60,
        ));
    }
}
