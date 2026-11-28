<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\MemberProvisioner;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PortalController extends Controller
{
    /** The web portal's own read model; existing mobile responses stay compatible. */
    public function programme(Request $request, \App\Services\Portal\MemberProgramme $programme): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->firstOrFail();

        return response()->json($programme->for($member));
    }

    /** GET /v1/member/portal — the shell's one startup call. */
    public function index(Request $request, PortalBootstrap $bootstrap, MemberProvisioner $provisioner): JsonResponse
    {
        $user = $request->user();
        $member = $provisioner->ensureForUser($user);

        return response()->json($bootstrap->build($user, $member));
    }
}
