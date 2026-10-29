<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\OperationsStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class OperationsStatusController extends Controller
{
    public function __invoke(Request $request, OperationsStatus $status): JsonResponse
    {
        $user = $request->user();
        abort_unless($user?->isStaff() && $user->staff?->is_active && $user->staff->isManager(), 403);
        return response()->json($status->forUser($user))->header('Cache-Control', 'private, no-store');
    }
}
