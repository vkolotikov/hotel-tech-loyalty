<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The morning email switch in Content's menu (spec 2026-10-19 §4.5): each person's own, off by default. */
class MorningEmailController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['on' => 'required|boolean']);
        $user = $request->user();
        $user->forceFill(['wants_content_morning_email' => (bool) $data['on']])->save();

        return response()->json(['on' => (bool) $user->wants_content_morning_email]);
    }
}
