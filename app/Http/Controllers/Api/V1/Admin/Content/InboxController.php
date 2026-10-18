<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentInbox;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The "For you" bell (spec 2026-10-16 §8): the list, its count, and "seen" — for the current brand. */
class InboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(ContentInbox::for($request->user(), ContentContext::profile()));
    }

    public function count(Request $request): JsonResponse
    {
        return response()->json(['count' => ContentInbox::count($request->user(), ContentContext::profile())]);
    }

    /** `at` is the list's `read_at`: what came in after the list was read stays new. */
    public function seen(Request $request): JsonResponse
    {
        $data = $request->validate(['at' => 'nullable|date']);
        $profile = ContentContext::profile();
        if ($profile) {
            $at = isset($data['at']) ? CarbonImmutable::parse($data['at'])->setTimezone(config('app.timezone')) : null;
            ContentInbox::markSeen($request->user(), $profile, $at);
        }

        return response()->json(['count' => ContentInbox::count($request->user(), $profile)]);
    }
}
