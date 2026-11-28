<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentLocations;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = ContentLocations::query((int) $request->attributes->get('workspace_org')->id, ContentContext::brandId())
            ->orderBy('name')->orderBy('id')->get(['id', ...ContentLocations::FIELDS]);

        return response()->json(['locations' => $rows->map(ContentLocations::present(...))->values()]);
    }

    public function store(Request $request, ContentLocations $locations): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = ContentLocations::validate($request->isJson() ? $request->json()->all() : $request->request->all(), true);
        $row = $locations->create((int) $request->attributes->get('workspace_org')->id, ContentContext::brandId(), $data);

        return response()->json(['location' => ContentLocations::present($row->fresh())], 201);
    }

    public function update(Request $request, int $id, ContentLocations $locations): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = ContentLocations::validate($request->isJson() ? $request->json()->all() : $request->request->all(), false);
        $row = $locations->update((int) $request->attributes->get('workspace_org')->id, ContentContext::brandId(), $id, $data);

        return response()->json(['location' => ContentLocations::present($row->fresh())]);
    }
}
