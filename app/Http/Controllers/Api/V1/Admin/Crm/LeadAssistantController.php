<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\Inquiry;
use App\Services\Crm\LeadAssistant;
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

        return response()->json($assistant->data($inquiry, $brand), $request->isMethod('POST') ? 202 : 200)
            ->header('Cache-Control', 'private, no-store');
    }
}
