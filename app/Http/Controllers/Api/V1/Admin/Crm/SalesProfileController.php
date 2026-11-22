<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Services\Crm\SalesBrand;
use App\Services\Crm\SalesProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesProfileController extends Controller
{
    public function __invoke(Request $request, SalesBrand $scope, SalesProfile $profiles): JsonResponse
    {
        $requested = $request->query('for_brand');
        abort_if($requested !== null && ! filter_var($requested, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]), 422);
        $brand = $scope->forSettings($request->user(), $requested === null ? null : (int) $requested);
        $org = $request->attributes->get('workspace_org');
        if ($request->isMethod('PUT')) {
            $brand = $profiles->save($brand, $request->validate(SalesProfile::rules()));
        }

        return response()->json($profiles->data($org, $brand))->header('Cache-Control', 'private, no-store');
    }
}
