<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Inquiry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Sub-resource of Inquiry: the unified activity timeline.
 *
 * `index($inquiry)` paginates the timeline for the lead-detail page.
 * `store($inquiry)` lets agents log a free-text activity (note / call
 * / email / meeting / file). Status changes and task completions are
 * NOT created here — those flow from their respective controllers
 * (InquiryController::update, TaskController::complete) which write
 * an activity row as a side-effect so the timeline stays in sync.
 *
 * Activities are append-only by design — there's no update or delete.
 * Edit a typo by adding a follow-up note. This matches how Pipedrive,
 * HubSpot, and Salesforce all structure their activity logs and keeps
 * the timeline trustworthy as an audit trail.
 */
class ActivityController extends Controller
{
    /** Allowed types for agent-created activities. System events use other types. */
    private const STORE_TYPES = ['note', 'call', 'email', 'meeting', 'file'];

    public function index(Inquiry $inquiry, Request $request): JsonResponse
    {
        $query = $inquiry->activities()
            ->with('creator:id,name,email');

        if ($filter = $request->string('type')->toString()) {
            $query->where('type', $filter);
        }

        $activities = $query->paginate($request->integer('per_page', 50));

        return response()->json([
            'data' => $activities->items(),
            'meta' => [
                'current_page' => $activities->currentPage(),
                'last_page'    => $activities->lastPage(),
                'total'        => $activities->total(),
            ],
        ]);
    }

    public function store(Inquiry $inquiry, Request $request): JsonResponse
    {
        $data = $request->validate([
            'type'             => 'required|string|in:' . implode(',', self::STORE_TYPES),
            'subject'          => 'nullable|string|max:200',
            'body'             => 'nullable|string|max:8000',
            'direction'        => 'nullable|string|in:inbound,outbound',
            'duration_minutes' => 'nullable|integer|min:0|max:1440',
            'occurred_at'      => 'nullable|date',
            'metadata'         => 'nullable|array',
        ]);

        $activity = $inquiry->activities()->create([
            'organization_id'   => $inquiry->organization_id,
            'brand_id'          => $inquiry->brand_id,
            'guest_id'          => $inquiry->guest_id,
            'corporate_account_id' => $inquiry->corporate_account_id,
            'type'              => $data['type'],
            'subject'           => $data['subject'] ?? null,
            'body'              => $data['body'] ?? null,
            'direction'         => $data['direction'] ?? null,
            'duration_minutes'  => $data['duration_minutes'] ?? null,
            'metadata'          => $data['metadata'] ?? null,
            'created_by'        => $request->user()->id,
            'occurred_at'       => $data['occurred_at'] ?? now(),
        ]);

        // The legacy inquiries.last_contacted_at column is still surfaced on
        // the list view ("Touches: N"); keep it warm so the existing UI shows
        // the freshest contact time.
        if (in_array($data['type'], ['call', 'email', 'meeting'], true)) {
            $inquiry->forceFill([
                'last_contacted_at' => $activity->occurred_at,
                'last_contact_comment' => $data['subject'] ?? $data['body'] ?? null,
            ])->save();
        }

        $activity->load('creator:id,name,email');
        return response()->json($activity, 201);
    }
}
