<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\CardLookup;
use App\Services\Loyalty\MemberDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Scan (spec 2026-10-21 §4.7): what a card reader or a typed entry gave, to
 * the member it names. The member's card itself is the member's page's
 * (`members/{id}`), which the workspace reads next; no AI call here.
 */
class ScanController extends Controller
{
    public function scan(Request $request, CardLookup $cards): JsonResponse
    {
        $data = $request->validate(['code' => 'required|string|max:2000']);
        $member = $cards->find($data['code'], $request->user());
        $member->loadMissing('user:id,name,email,phone');

        return response()->json(['member' => MemberDirectory::row($member)]);
    }
}
