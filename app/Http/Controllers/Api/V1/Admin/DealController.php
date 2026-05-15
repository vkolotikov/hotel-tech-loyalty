<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inquiry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        ])->where(function ($q) {
            $q->whereNotNull('fulfillment_stage')
              ->orWhere('status', 'Confirmed')
              ->orWhereHas('pipelineStage', fn ($p) => $p->where('kind', 'won'));
        });

        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('event_name', 'ilike', "%$s%")
                  ->orWhere('room_type_requested', 'ilike', "%$s%")
                  ->orWhereHas('guest', fn ($g) => $g
                      ->where('full_name', 'ilike', "%$s%")
                      ->orWhere('company', 'ilike', "%$s%"));
            });
        }

        if ($stage = $request->get('stage'))     $query->where('fulfillment_stage', $stage);
        if ($p     = $request->get('payment'))   $query->where('payment_status', $p);
        if ($prop  = $request->get('property_id')) $query->where('property_id', $prop);
        if ($own   = $request->get('owner'))     $query->where('assigned_to', $own);

        $focus = $request->get('focus');
        if ($focus === 'overdue') {
            $query->where('next_task_completed', false)
                  ->whereNotNull('next_task_due')
                  ->where('next_task_due', '<', now()->toDateString());
        } elseif ($focus === 'high_value') {
            // Top quartile by total_value over open (not completed) deals.
            // Cheap heuristic: anything >= 500 is "high value" — staff can
            // change the threshold per-org later via crm_settings.
            $query->whereNotNull('total_value')
                  ->where('total_value', '>=', 500)
                  ->where(fn ($q) => $q->whereNull('fulfillment_stage')
                                       ->orWhere('fulfillment_stage', '!=', 'completed'));
        }

        $sort = $request->get('sort', 'due_date');
        if ($sort === 'amount') {
            $query->orderByDesc('total_value');
        } elseif ($sort === 'created') {
            $query->orderByDesc('created_at');
        } else {
            // Default: due date asc, with overdue at the top
            $query->orderByRaw('next_task_due IS NULL, next_task_due ASC');
        }

        $perPage = (int) $request->get('per_page', 10);
        $page = $query->paginate(min($perPage, 50));

        return response()->json($page);
    }

    /**
     * GET /v1/admin/deals/kpis — 6 headline numbers for the page header.
     *
     * total + per-stage counts + per-stage sum(total_value) + completed-
     * this-month bucket. All inside one query pass so the page stays
     * snappy regardless of pipeline size.
     */
    public function kpis(): JsonResponse
    {
        $base = Inquiry::query()->where(function ($q) {
            $q->whereNotNull('fulfillment_stage')
              ->orWhere('status', 'Confirmed')
              ->orWhereHas('pipelineStage', fn ($p) => $p->where('kind', 'won'));
        });

        $total = (clone $base)->whereNotIn('fulfillment_stage', ['completed'])
            ->orWhereNull('fulfillment_stage')
            ->count();

        $byStage = (clone $base)
            ->whereNotNull('fulfillment_stage')
            ->selectRaw('fulfillment_stage, count(*) as cnt, coalesce(sum(total_value), 0) as total')
            ->groupBy('fulfillment_stage')
            ->get()
            ->keyBy('fulfillment_stage');

        // Awaiting Payment — count deals whose payment_status is not paid.
        // Distinct from fulfillment_stage=payment_pending because a deal
        // can be in_production with payment still partial.
        $awaitingPay = (clone $base)
            ->where(function ($q) {
                $q->whereIn('payment_status', ['pending', 'invoice_sent', 'partial'])
                  ->orWhereNull('payment_status');
            })
            ->where(fn ($q) => $q->whereNull('fulfillment_stage')
                                 ->orWhere('fulfillment_stage', '!=', 'completed'));
        $awaitingPayCount = (clone $awaitingPay)->count();
        $awaitingPayValue = (clone $awaitingPay)->sum('total_value');

        $completedThisMonth = (clone $base)
            ->where('fulfillment_stage', 'completed')
            ->where('fulfillment_completed_at', '>=', now()->startOfMonth());
        $completedCount = (clone $completedThisMonth)->count();
        $completedValue = (clone $completedThisMonth)->sum('total_value');

        $stageRow = fn (string $key) => [
            'count' => (int) ($byStage[$key]->cnt ?? 0),
            'value' => round((float) ($byStage[$key]->total ?? 0), 2),
        ];

        return response()->json([
            'total'              => $total,
            'awaiting_payment'   => ['count' => $awaitingPayCount, 'value' => round((float) $awaitingPayValue, 2)],
            'design_needed'      => $stageRow('design_needed'),
            'in_production'      => $stageRow('in_production'),
            'ready_to_ship'      => $stageRow('ready_to_ship'),
            'completed_month'    => ['count' => $completedCount, 'value' => round((float) $completedValue, 2)],
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

        // Payment status distribution (open deals only)
        $paymentRows = $base()
            ->where(fn ($q) => $q->whereNull('fulfillment_stage')->orWhere('fulfillment_stage', '!=', 'completed'))
            ->selectRaw('COALESCE(payment_status, \'unset\') as status, COUNT(*) as cnt')
            ->groupBy('status')
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
            ->where('next_task_due', '<', now()->toDateString())
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

        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
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

        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
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
