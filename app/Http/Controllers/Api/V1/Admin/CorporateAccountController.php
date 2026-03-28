<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CorporateAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CorporateAccountController extends Controller
{
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
        ]);

        return response()->json(CorporateAccount::create($v), 201);
    }

    public function show(CorporateAccount $corporateAccount): JsonResponse
    {
        $corporateAccount->loadCount(['inquiries', 'reservations']);
        $corporateAccount->load([
            'reservations' => fn($q) => $q->latest('check_in')->limit(10),
            'inquiries'    => fn($q) => $q->latest()->limit(10),
        ]);
        return response()->json($corporateAccount);
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
        ]);

        $corporateAccount->update($v);
        return response()->json($corporateAccount);
    }

    public function destroy(CorporateAccount $corporateAccount): JsonResponse
    {
        $corporateAccount->delete();
        return response()->json(['message' => 'Corporate account deleted']);
    }
}
