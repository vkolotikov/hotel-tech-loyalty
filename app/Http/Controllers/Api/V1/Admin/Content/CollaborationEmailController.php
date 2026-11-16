<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CollaborationEmailController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['on' => 'required|boolean']);
        $request->user()->forceFill(['wants_content_collaboration_email' => (bool) $data['on']])->save();
        return response()->json(['on' => (bool) $data['on']]);
    }
}
