<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
use App\Services\Content\ContentRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** The Plan: a week, a month grid or a list's range (spec 2026-10-14 §4.2). */
class PlanController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => 'required|date_format:Y-m-d',
            'to'   => 'required|date_format:Y-m-d|after_or_equal:from',
        ]);
        if (ContentRules::days($data['from'], $data['to']) > ContentRules::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => 'The range can be at most ' . ContentRules::MAX_RANGE_DAYS . ' days.']);
        }

        $profile = ContentContext::profile();
        if (!$profile) {
            return response()->json(['posts' => [], 'unscheduled' => [], 'unscheduled_total' => 0, 'slots' => [], 'figures' => ['planned' => 0, 'ready' => 0, 'published' => 0, 'open_slots' => 0]]);
        }

        return response()->json(ContentPlan::for($profile, $data['from'], $data['to'], VenueClock::today(ContentContext::orgId())));
    }
}
