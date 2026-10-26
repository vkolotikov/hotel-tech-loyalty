<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\Setup\SetupProgress;
use Illuminate\Http\JsonResponse;

/**
 * "Start here" (release 10, owner 2026-10-26): the steps that set the programme up and which are done
 * (SetupProgress). Every staff member reads it; each step opens the page that does it, where the usual rights apply.
 */
class StartController extends Controller
{
    public function show(SetupProgress $progress): JsonResponse
    {
        return response()->json($progress->for((int) app('current_organization_id')));
    }
}
