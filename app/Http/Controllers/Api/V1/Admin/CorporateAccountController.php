<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CorporateAccount;
use App\Services\CustomFieldService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CorporateAccountController extends Controller
{
    public function __construct(protected CustomFieldService $customFields) {}

    public function index(Request $request): JsonResponse
    {
        $query = CorporateAccount::query();

        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('company_name', 'ilike', "%$s%")
                  ->orWhere('contact_person', 'ilike', "%$s%")
                  ->orWhere('industry', 'ilike', "%$s%");
            });
        }
        if ($status = $request->get('status')) $query->where('status', $status);
        if ($manager = $request->get('account_manager')) $query->where('account_manager', $manager);

        return response()->json(
            $query->orderBy($request->get('sort', 'company_name'), $request->get('dir', 'asc'))
                  ->paginate($request->get('per_page', 25))
        );
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'company_name'              => 'required|string|max:200',
            'industry'                  => 'nullable|string|max:100',
            'tax_id'                    => 'nullable|string|max:50',
            'billing_address'           => 'nullable|string',
            'billing_email'             => 'nullable|email|max:150',
            'contact_person'            => 'nullable|string|max:150',
            'contact_email'             => 'nullable|email|max:150',
            'contact_phone'             => 'nullable|string|max:50',
            'account_manager'           => 'nullable|string|max:150',
            'contract_start'            => 'nullable|date',
            'contract_end'              => 'nullable|date',
            'negotiated_rate'           => 'nullable|numeric|min:0',
            'rate_type'                 => 'nullable|string|max:30',
            'discount_percentage'       => 'nullable|numeric|min:0|max:100',
            'annual_room_nights_target' => 'nullable|integer|min:0',
            'payment_terms'             => 'nullable|string|max:50',
            'credit_limit'              => 'nullable|numeric|min:0',
            'notes'                     => 'nullable|string',
            'custom_data'               => 'nullable|array',
        ]);

        $v['custom_data'] = $this->customFields->validate('corporate_account', $v['custom_data'] ?? null);

        return response()->json(CorporateAccount::create($v), 201);
    }

    public function show(CorporateAccount $corporateAccount): JsonResponse
    {
        $corporateAccount->loadCount(['inquiries', 'reservations']);
        $corporateAccount->load([
            'reservations' => fn($q) => $q->latest('check_in')->limit(10),
            'inquiries'    => fn($q) => $q->latest()->limit(10)->with('guest:id,full_name'),
        ]);

        // CRM Phase 4: rolled-up account vitals for the expanded detail panel.
        // - confirmed_revenue: lifetime sum of confirmed reservation totals.
        //   This is the LTV figure shown on the Companies list.
        // - open_pipeline_value / count: deals still in flight, not closed.
        // - last_contact_at: most recent activity touch on any of the
        //   account's inquiries — drives the "going cold" signal at the
        //   account level (different from the per-inquiry one).
        // - credit_used / credit_pct: against the configured credit limit.
        //   We approximate "outstanding" as confirmed-but-not-checked-out
        //   reservations plus quoted open inquiries — close enough until
        //   we wire real invoice tracking (Phase 5+).
        $confirmedRevenue = (float) \App\Models\Reservation::where('corporate_account_id', $corporateAccount->id)
            ->where('status', 'Confirmed')
            ->sum('total_amount');

        $openInquiries = \App\Models\Inquiry::where('corporate_account_id', $corporateAccount->id)
            ->whereNotIn('status', ['Confirmed', 'Lost']);
        $openPipelineValue = (float) (clone $openInquiries)->sum('total_value');
        $openPipelineCount = (int) (clone $openInquiries)->count();

        $outstanding = (float) \App\Models\Reservation::where('corporate_account_id', $corporateAccount->id)
            ->where('status', 'Confirmed')
            ->whereNull('checked_out_at')
            ->sum('total_amount');

        $lastContact = \App\Models\Activity::whereIn(
                'inquiry_id',
                \App\Models\Inquiry::where('corporate_account_id', $corporateAccount->id)->pluck('id')
            )
            ->orderByDesc('occurred_at')
            ->value('occurred_at');

        $creditLimit = $corporateAccount->credit_limit ? (float) $corporateAccount->credit_limit : null;
        $creditPct = $creditLimit && $creditLimit > 0
            ? min(100, round($outstanding / $creditLimit * 100, 1))
            : null;

        $contractEnd = $corporateAccount->contract_end;
        $renewalSoon = $contractEnd
            && $contractEnd->isFuture()
            && $contractEnd->lte(now()->addDays(60));

        $payload = $corporateAccount->toArray();
        $payload['ltv'] = [
            'confirmed_revenue'    => round($confirmedRevenue, 2),
            'open_pipeline_value'  => round($openPipelineValue, 2),
            'open_pipeline_count'  => $openPipelineCount,
            'outstanding'          => round($outstanding, 2),
            'credit_pct'           => $creditPct,
            'last_contact_at'      => $lastContact,
            'renewal_soon'         => $renewalSoon,
        ];

        // Reshape recent items into the lighter format the frontend
        // already reads. Keeping the existing keys means no breaking
        // change for the current detail panel.
        $payload['recent_reservations'] = $corporateAccount->reservations->map(fn($r) => [
            'id'            => $r->id,
            'reference'     => $r->confirmation_no,
            'check_in'      => optional($r->check_in)->toDateString(),
            'check_out'     => optional($r->check_out)->toDateString(),
            'total'         => $r->total_amount,
            'status'        => $r->status,
        ])->all();

        $payload['recent_inquiries'] = $corporateAccount->inquiries->map(fn($i) => [
            'id'            => $i->id,
            'guest_name'    => $i->guest?->full_name,
            'inquiry_type'  => $i->inquiry_type,
            'check_in'      => optional($i->check_in)->toDateString(),
            'total_value'   => $i->total_value,
            'status'        => $i->status,
            'created_at'    => optional($i->created_at)->toIso8601String(),
        ])->all();

        return response()->json($payload);
    }

    public function update(Request $request, CorporateAccount $corporateAccount): JsonResponse
    {
        $v = $request->validate([
            'company_name'              => 'sometimes|string|max:200',
            'industry'                  => 'nullable|string|max:100',
            'tax_id'                    => 'nullable|string|max:50',
            'billing_address'           => 'nullable|string',
            'billing_email'             => 'nullable|email|max:150',
            'contact_person'            => 'nullable|string|max:150',
            'contact_email'             => 'nullable|email|max:150',
            'contact_phone'             => 'nullable|string|max:50',
            'account_manager'           => 'nullable|string|max:150',
            'contract_start'            => 'nullable|date',
            'contract_end'              => 'nullable|date',
            'negotiated_rate'           => 'nullable|numeric|min:0',
            'rate_type'                 => 'nullable|string|max:30',
            'discount_percentage'       => 'nullable|numeric|min:0|max:100',
            'annual_room_nights_target' => 'nullable|integer|min:0',
            'payment_terms'             => 'nullable|string|max:50',
            'credit_limit'              => 'nullable|numeric|min:0',
            'status'                    => 'nullable|string|max:30',
            'notes'                     => 'nullable|string',
            'custom_data'               => 'nullable|array',
        ]);

        if (array_key_exists('custom_data', $v)) {
            $v['custom_data'] = $this->customFields->validate('corporate_account', $v['custom_data']);
        }

        $corporateAccount->update($v);
        return response()->json($corporateAccount);
    }

    public function destroy(CorporateAccount $corporateAccount): JsonResponse
    {
        $corporateAccount->delete();
        return response()->json(['message' => 'Corporate account deleted']);
    }
}
