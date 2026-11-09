<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Dashboard\VenuePulse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The venue's clock, place and weather for a dashboard (VenuePulse). One answer, reached at each interface's own address
 * so every workspace keeps to its own area: `admin/dashboard/pulse` (the full admin), and `pulse` under
 * `admin/appointments`, `admin/content`, `admin/loyalty`, `admin/crm` and `admin/time` (their AccessMap prefixes:
 * every staff member, the workspace's product). Reads only.
 */
class PulseController extends Controller
{
    public function show(Request $request, VenuePulse $pulse): JsonResponse
    {
        /** @var Organization|null $org */
        $org = $request->attributes->get('workspace_org')
            ?? Organization::withoutGlobalScopes()->find($request->user()?->organization_id);
        abort_if($org === null, 404);

        return response()->json($pulse->for($org));
    }
}
