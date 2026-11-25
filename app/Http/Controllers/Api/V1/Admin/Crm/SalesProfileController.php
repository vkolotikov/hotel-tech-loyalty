<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Services\Crm\SalesBrand;
use App\Services\Crm\SalesProfile;
use App\Services\Crm\SalesProfileCapture;
use App\Services\KnowledgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesProfileController extends Controller
{
    public function __invoke(Request $request, SalesBrand $scope, SalesProfile $profiles): JsonResponse
    {
        $brand = $this->brand($request, $scope);
        $org = $request->attributes->get('workspace_org');
        if ($request->isMethod('PUT')) {
            $input = $request->validate(SalesProfile::rules());
            if (array_key_exists('goal', $input['fields']) || array_key_exists('shared_fields', $input)) {
                abort_unless($org->hasFeature('chatbot') || $request->user()->isPlatformAdmin(), 403);
            }
            $brand = $profiles->save($brand, $input);
        }

        return response()->json($profiles->data($org, $brand) + ['knowledge' => app(KnowledgeService::class)->inventory($brand)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function capture(Request $request, SalesBrand $scope, SalesProfileCapture $captures): JsonResponse
    {
        $brand = $this->brand($request, $scope);
        if ($request->isMethod('POST')) {
            $input = $request->validate([
                'profile_brand' => 'required|integer|min:1',
                'company_name' => 'nullable|string|max:200',
                'website' => 'nullable|string|max:2000',
                'search_web' => 'sometimes|boolean', 'use_knowledge' => 'sometimes|boolean',
                'language' => 'required|in:en,de,fr,es,ru',
                'attachments' => 'sometimes|array|list|max:3',
                'attachments.*' => 'required|file|max:4096',
            ]);
            $captures->start($request->attributes->get('workspace_org'), $brand, $input, $request->file('attachments', []), $request->user()->id);
        }

        return response()->json($captures->data($brand), $request->isMethod('POST') ? 202 : 200)->header('Cache-Control', 'private, no-store');
    }

    private function brand(Request $request, SalesBrand $scope): Brand
    {
        $requested = $request->query('for_brand');
        abort_if($requested !== null && ! filter_var($requested, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]), 422);

        return $scope->forSettings($request->user(), $requested === null ? null : (int) $requested);
    }
}
