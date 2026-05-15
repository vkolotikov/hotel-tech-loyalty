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
