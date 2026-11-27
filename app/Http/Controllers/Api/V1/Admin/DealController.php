<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Services\Crm\DealListQuery;
use App\Services\Crm\OpenLeadValue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Deals & Fulfillment — the post-sale half of an inquiry's life.
 *
 * Once a sales inquiry is marked Confirmed (status='Confirmed' or
 * pipeline_stage->kind='won'), it gets seeded into the fulfillment
 * pipeline by stamping `fulfillment_stage` and `payment_status`.
 * From there staff can walk it through Payment Pending → Design
 * Needed → Design Sent → In Production → Ready to Ship → Completed.
 *
 * We deliberately reuse the `inquiries` table rather than a new
 * `deals` table — a deal IS the won inquiry. Splitting would force
 * a join on every list query for no clear win.
 */
class DealController extends Controller
{
    public const STAGES = [
        'payment_pending',
        'design_needed',
        'design_sent',
        'in_production',
        'ready_to_ship',
        'completed',
    ];

    public const PAYMENT_STATUSES = [
        'pending',
        'invoice_sent',
        'partial',
        'paid',
        'refunded',
    ];

    /**
     * GET /v1/admin/deals — paginated list of deals.
     *
     * A "deal" = an inquiry that has either a fulfillment_stage set OR
     * status='Confirmed' OR a pipeline stage of kind='won'. Filters by
     * stage (?stage=design_needed), payment (?payment=partial),
     * overdue (?focus=overdue), high_value (?focus=high_value).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Inquiry::with([
            'guest:id,full_name,company,email,phone,mobile',
            'property:id,name,code',
            'pipelineStage:id,name,color,kind',
        ]);
        DealListQuery::apply($query, $request);
        $page = $query->paginate(max(1, min($request->integer('per_page', 10), 50)));
        return response()->json($page);
    }

    /**
     * GET /v1/admin/deals/kpis — 6 headline numbers for the page header.
     *
     * Counts and reporting-currency values for the same records as each list filter.
     */
    public function kpis(OpenLeadValue $valuation): JsonResponse
    {
        $base = DealListQuery::deals(Inquiry::query());
        $organization = Organization::findOrFail(app('current_organization_id'));
        $total = DealListQuery::active(clone $base)->count();

        $byStage = (clone $base)
            ->whereNotNull('fulfillment_stage')
            ->selectRaw('fulfillment_stage, count(*) as cnt, coalesce(sum(total_value), 0) as total')
            ->groupBy('fulfillment_stage')
            ->get()
            ->keyBy('fulfillment_stage');

        $awaitingPay = DealListQuery::unpaid(clone $base);
        $completedThisMonth = DealListQuery::completedThisMonth(clone $base);
        $figure = fn ($query) => [
            'count' => (clone $query)->count(),
            'value' => round((float) (clone $query)->sum('total_value'), 2),
            'valuation' => $valuation->summary($query, $organization),
        ];

        $stageRow = fn (string $key) => [
            'count' => (int) ($byStage[$key]->cnt ?? 0),
            'value' => round((float) ($byStage[$key]->total ?? 0), 2),
        ];

        return response()->json([
            'total'              => $total,
            // Deals not paid in full, whatever their step (the full admin's figure, kept as it was).
            'awaiting_payment'   => $figure($awaitingPay),
            // The step "Awaiting payment" itself (2026-11-08): what `?stage=payment_pending` lists, so its pill can count.
            'payment_pending'    => $stageRow('payment_pending'),
            'design_needed'      => $stageRow('design_needed'),
            'design_sent'        => $stageRow('design_sent'),
            'completed'          => $stageRow('completed'),
            'in_production'      => $stageRow('in_production'),
            'ready_to_ship'      => $stageRow('ready_to_ship') + [
                'valuation' => $valuation->summary((clone $base)->where('fulfillment_stage', 'ready_to_ship'), $organization),
            ],
            'completed_month'    => $figure($completedThisMonth),
        ]);
    }

    /**
     * GET /v1/admin/deals/analytics?days=N — deeper analytics for the
     * /analytics → Deals tab. Returns:
     *   - revenue_trend: daily sum of total_value for deals completed
     *     in the window (won-deal momentum graph)
     *   - new_deal_trend: daily count of deals entering fulfillment
     *   - stage_distribution: count + sum(total_value) per stage right
     *     now (for stacked bar chart)
     *   - payment_distribution: count by payment_status
     *   - cycle_time_days: avg days from fulfillment_started_at to
     *     fulfillment_completed_at for deals completed in the window
     *   - top_customers: top 10 customers by total deal value
     *   - stuck_deals: count of open deals where next_task_due is
     *     overdue (proxy for stalled fulfillment)
     */
    public function analytics(\Illuminate\Http\Request $request): JsonResponse
    {
        $days = max(7, min(365, (int) $request->query('days', 30)));
        $from = now()->subDays($days - 1)->startOfDay();

        $base = fn () => Inquiry::query()->where(function ($q) {
            $q->whereNotNull('fulfillment_stage')
              ->orWhere('status', 'Confirmed')
              ->orWhereHas('pipelineStage', fn ($p) => $p->where('kind', 'won'));
        });

        // Daily revenue won (completed in window)
        $revenueRows = $base()
            ->whereNotNull('fulfillment_completed_at')
            ->where('fulfillment_completed_at', '>=', $from)
            ->selectRaw('DATE(fulfillment_completed_at) as day, COUNT(*) as cnt, COALESCE(SUM(total_value), 0) as revenue')
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        // Daily new deals (entered fulfillment in window — proxy: created_at)
        $newRows = $base()
            ->where('created_at', '>=', $from)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as cnt')
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        $revenueTrend = [];
        $newTrend     = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = now()->subDays($i)->format('Y-m-d');
            $revenueTrend[] = [
                'date'    => $d,
                'count'   => (int) ($revenueRows[$d]->cnt ?? 0),
                'revenue' => round((float) ($revenueRows[$d]->revenue ?? 0), 2),
            ];
            $newTrend[] = [
                'date'  => $d,
                'count' => (int) ($newRows[$d]->cnt ?? 0),
            ];
        }

        // Stage distribution (current snapshot)
        $stageRows = $base()
            ->whereNotNull('fulfillment_stage')
            ->selectRaw('fulfillment_stage as stage, COUNT(*) as cnt, COALESCE(SUM(total_value), 0) as revenue')
            ->groupBy('fulfillment_stage')
            ->get();

        $stageDistribution = [];
        foreach (self::STAGES as $stage) {
            $row = $stageRows->firstWhere('stage', $stage);
            $stageDistribution[] = [
                'stage'   => $stage,
                'count'   => $row ? (int) $row->cnt : 0,
                'revenue' => $row ? round((float) $row->revenue, 2) : 0,
            ];
        }

        // Payment status distribution (open deals only).
        //
        // Postgres trap: groupBy('status') would compile to
        // `GROUP BY "status"`, which Postgres binds to the inquiries.status
        // column (the legacy CRM-status mirror New/Confirmed/Lost), NOT to
        // the SELECT alias of COALESCE(payment_status, 'unset'). That
        // ambiguity made the query fail with SQLSTATE[42803]
        // (8 occurrences in Nightwatch). Grouping by the expression
        // itself sidesteps the ambiguity and works on every supported
        // engine.
        $paymentRows = $base()
            ->where(fn ($q) => $q->whereNull('fulfillment_stage')->orWhere('fulfillment_stage', '!=', 'completed'))
            ->selectRaw("COALESCE(payment_status, 'unset') as status, COUNT(*) as cnt")
            ->groupBy(DB::raw("COALESCE(payment_status, 'unset')"))
            ->get()
            ->map(fn ($r) => ['status' => $r->status, 'count' => (int) $r->cnt]);

        // Avg cycle time in days (completed deals in window)
        $cycleRow = $base()
            ->whereNotNull('fulfillment_started_at')
            ->whereNotNull('fulfillment_completed_at')
            ->where('fulfillment_completed_at', '>=', $from)
            ->selectRaw('AVG(EXTRACT(EPOCH FROM (fulfillment_completed_at - fulfillment_started_at)) / 86400.0) as days')
            ->first();
        $cycleTimeDays = round((float) ($cycleRow->days ?? 0), 1);

        // Top customers by deal value (window-agnostic — lifetime value
        // of the deals on this customer)
        $topCustomers = $base()
            ->whereNotNull('guest_id')
            ->with('guest:id,full_name,company')
            ->selectRaw('guest_id, COUNT(*) as deals, COALESCE(SUM(total_value), 0) as revenue')
            ->groupBy('guest_id')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'guest_id' => $r->guest_id,
                'name'     => $r->guest?->full_name ?? '—',
                'company'  => $r->guest?->company,
                'deals'    => (int) $r->deals,
                'revenue'  => round((float) $r->revenue, 2),
            ]);

        // Stuck deals — open, with an overdue next_task_due
        $stuckDeals = $base()
            ->where(fn ($q) => $q->whereNull('fulfillment_stage')->orWhere('fulfillment_stage', '!=', 'completed'))
            ->where('next_task_completed', false)
            ->whereNotNull('next_task_due')
            ->where('next_task_due', '<', \App\Services\Appointments\VenueClock::today((int) app('current_organization_id')))
            ->count();

        return response()->json([
            'period_days'         => $days,
            'revenue_trend'       => $revenueTrend,
            'new_deal_trend'      => $newTrend,
            'stage_distribution'  => $stageDistribution,
            'payment_distribution'=> $paymentRows,
            'cycle_time_days'     => $cycleTimeDays,
            'top_customers'       => $topCustomers,
            'stuck_deals'         => $stuckDeals,
        ]);
    }

    /**
     * PATCH /v1/admin/deals/{id}/stage — advance the fulfillment stage.
     * Stamps fulfillment_started_at on first stage entry, and
     * fulfillment_completed_at when the deal hits `completed`.
     */
    public function updateStage(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'stage' => 'required|string|in:' . implode(',', self::STAGES),
        ]);

        $inquiry = DealListQuery::deals(Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class))->findOrFail($id);
        $oldStage = $inquiry->fulfillment_stage;
        $inquiry->fulfillment_stage = $validated['stage'];

        if (! $inquiry->fulfillment_started_at && $oldStage === null) {
            $inquiry->fulfillment_started_at = now();
        }
        if ($validated['stage'] === 'completed' && ! $inquiry->fulfillment_completed_at) {
            $inquiry->fulfillment_completed_at = now();
        } elseif ($validated['stage'] !== 'completed') {
            // Re-opening a previously completed deal — clear the completion
            // timestamp so analytics don't double-count.
            $inquiry->fulfillment_completed_at = null;
        }

        $inquiry->save();

        return response()->json([
            'success' => true,
            'fulfillment_stage' => $inquiry->fulfillment_stage,
            'fulfillment_started_at' => $inquiry->fulfillment_started_at,
            'fulfillment_completed_at' => $inquiry->fulfillment_completed_at,
        ]);
    }

    /**
     * PATCH /v1/admin/deals/{id}/payment — update payment status + amount.
     * The amount is independent of status (partial payments can sit at
     * payment_status=partial with paid_amount<total_value).
     */
    public function updatePayment(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'payment_status' => 'nullable|string|in:' . implode(',', self::PAYMENT_STATUSES),
            'paid_amount'    => 'nullable|numeric|min:0',
        ]);

        $inquiry = DealListQuery::deals(Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class))->findOrFail($id);
        if (array_key_exists('payment_status', $validated)) {
            $inquiry->payment_status = $validated['payment_status'];
        }
        if (array_key_exists('paid_amount', $validated)) {
            $inquiry->paid_amount = $validated['paid_amount'];
        }
        $inquiry->save();

        return response()->json([
            'success' => true,
            'payment_status' => $inquiry->payment_status,
            'paid_amount' => $inquiry->paid_amount,
        ]);
    }
}
