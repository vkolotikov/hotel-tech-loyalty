<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\Inquiry;
use App\Models\Brand;
use App\Services\Crm\CrmAccess;
use App\Services\Crm\LeadAssistant;
use App\Services\Crm\LeadQuote;
use App\Services\Crm\SalesBrand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class LeadAssistantController extends Controller
{
    public function __invoke(Request $request, Inquiry $inquiry, SalesBrand $scope, LeadAssistant $assistant): JsonResponse
    {
        $brand = $scope->forLead($request->user(), $inquiry);
        if ($request->isMethod('POST')) {
            $assistant->start($inquiry, $brand, $request->attributes->get('workspace_org'), $request->validate([
                'mode' => ['required', Rule::in(LeadAssistant::MODES)],
                'language' => 'required|in:en,de,fr,es,ru',
                'focus' => 'nullable|string|max:600',
            ]), (int) $request->user()->id);
        }
        if ($request->isMethod('PUT')) {
            $assistant->saveStrategy($inquiry, $brand, $request->validate([
                'mode' => ['required', Rule::in(LeadAssistant::STRATEGIES)],
                'revision' => 'required|integer|min:0',
                'body' => 'present|nullable|string|max:'.LeadAssistant::STRATEGY_LIMIT,
            ]));
        }

        return $this->state($request, $inquiry, $brand, $assistant);
    }

    public function quote(Request $request, Inquiry $inquiry, SalesBrand $scope, LeadAssistant $assistant): JsonResponse
    {
        $brand = $scope->forLead($request->user(), $inquiry);
        $assistant->saveQuote($inquiry, $brand, $request->validate(LeadQuote::rules()), (int) $request->user()->id);

        return $this->state($request, $inquiry, $brand, $assistant);
    }

    public function review(Request $request, Inquiry $inquiry, SalesBrand $scope, LeadAssistant $assistant): JsonResponse
    {
        $brand = $scope->forLead($request->user(), $inquiry);
        $input = $request->validate([
            'revision' => 'required|integer|min:0', 'source_id' => 'required|uuid', 'mode' => ['required', Rule::in(LeadAssistant::EMAIL_MODES)],
            'subject' => 'required|string|max:240', 'body' => 'required|string|max:10000',
        ]);
        $assistant->reviewEmail($inquiry, $brand, $input, (int) $request->user()->id);

        return $this->state($request, $inquiry, $brand, $assistant);
    }

    private function state(Request $request, Inquiry $inquiry, Brand $brand, LeadAssistant $assistant): JsonResponse
    {
        return response()->json([...$assistant->data($inquiry, $brand), 'can_review' => CrmAccess::isManager($request->user())], $request->isMethod('POST') ? 202 : 200)
            ->header('Cache-Control', 'private, no-store');
    }
}
