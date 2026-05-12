<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\MemberSegment;
use App\Services\MemberSegmentService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Admin CRUD for saved member segments + the campaign-send action
 * that turns a saved segment into a bulk push (and optionally a
 * bulk email).
 *
 * Endpoints:
 *   GET    /v1/admin/segments
 *   POST   /v1/admin/segments
 *   GET    /v1/admin/segments/{id}
 *   PUT    /v1/admin/segments/{id}
 *   DELETE /v1/admin/segments/{id}
 *   POST   /v1/admin/segments/preview     — count + 10 sample rows for an unsaved definition
 *   POST   /v1/admin/segments/{id}/send   — send a campaign to a saved segment
 *
 * Send is hard-capped at 5000 recipients per call (MemberSegmentService
 * memberIds limit) so a "everybody" definition can't melt the queue.
 * For programs larger than that, a future iteration will chunk into
 * a job queue.
 */
class SegmentAdminController extends Controller
{
    public function __construct(protected MemberSegmentService $segments) {}

    public function index(): JsonResponse
    {
        $rows = MemberSegment::with('createdBy:id,name')
            ->orderByDesc('updated_at')
            ->get();
        return response()->json(['segments' => $rows]);
    }

    public function show(int $id): JsonResponse
    {
        $segment = MemberSegment::with('createdBy:id,name')->findOrFail($id);
        return response()->json(['segment' => $segment]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $segment = MemberSegment::create([
            'name'               => $data['name'],
            'description'        => $data['description'] ?? null,
            'definition'         => $data['definition'],
            'created_by_user_id' => $request->user()->id,
        ]);

        // Compute the count up-front so the list page shows a real
        // number the first time it loads, not a dash.
        $this->recomputeCount($segment);

        AuditLog::record('segment_created', $segment,
            ['name' => $segment->name], [],
            $request->user(),
            "Segment '{$segment->name}' created");

        return response()->json(['segment' => $segment->fresh()], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $segment = MemberSegment::findOrFail($id);
        $data = $this->validatePayload($request);
        $oldName = $segment->name;

        $segment->update([
            'name'        => $data['name'],
            'description' => $data['description'] ?? null,
            'definition'  => $data['definition'],
        ]);
        $this->recomputeCount($segment);

        AuditLog::record('segment_updated', $segment,
            ['name' => $segment->name], ['name' => $oldName],
            $request->user(),
            "Segment '{$segment->name}' updated");

        return response()->json(['segment' => $segment->fresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $segment = MemberSegment::findOrFail($id);
        $name = $segment->name;
        $segment->delete();

        AuditLog::record('segment_deleted', null,
            ['segment_id' => $id, 'name' => $name], [],
            $request->user(),
            "Segment '{$name}' deleted");

        return response()->json(['success' => true]);
    }

    /**
     * Preview an unsaved definition. Returns count + first 10 rows.
     * Used by the segment builder so the admin sees the audience
     * shape before saving / sending.
     */
    public function preview(Request $request): JsonResponse
    {
        $request->validate([
            'definition' => 'required|array',
        ]);
        $def = $request->input('definition');

        $count = $this->segments->count($def);
        $sample = $this->segments->buildQuery($def)
            ->with(['user:id,name,email', 'tier:id,name,color_hex'])
            ->limit(10)
            ->get()
            ->map(fn ($m) => [
                'id'              => $m->id,
                'name'            => $m->user?->name,
                'email'           => $m->user?->email,
                'tier'            => $m->tier?->name,
                'tier_color'      => $m->tier?->color_hex,
                'current_points'  => (int) $m->current_points,
                'last_activity_at'=> $m->last_activity_at?->toIso8601String(),
            ])
            ->all();

        return response()->json([
            'count'  => $count,
            'sample' => $sample,
        ]);
    }

    /**
     * Send a bulk push (+ optional email) to every member matching
     * the saved segment. Mirrors MemberAdminController::bulkMessage
     * so the recipient handling is identical.
     */
    public function send(Request $request, int $id, NotificationService $notify): JsonResponse
    {
        $validated = $request->validate([
            'title'      => 'required|string|max:120',
            'body'       => 'required|string|max:500',
            'send_email' => 'sometimes|boolean',
            'category'   => 'sometimes|string|in:offers,points,tier,stays,transactional',
        ]);

        $segment = MemberSegment::findOrFail($id);
        $memberIds = $this->segments->memberIds($segment->definition ?? []);
        if (empty($memberIds)) {
            return response()->json([
                'total' => 0, 'push_sent' => 0, 'email_sent' => 0, 'skipped' => 0,
                'message' => 'Segment is empty — nothing sent.',
            ]);
        }

        $category = $validated['category'] ?? 'transactional';
        $type = match ($category) {
            'offers'  => 'new_offer',
            'points'  => 'points_earned',
            'tier'    => 'tier_upgrade',
            'stays'   => 'booking',
            default   => 'admin_broadcast',
        };

        $members = LoyaltyMember::whereIn('id', $memberIds)->with('user')->get();

        $pushSent = 0;
        $emailSent = 0;
        $skipped = 0;

        foreach ($members as $m) {
            try {
                if ($m->push_notifications && $m->expo_push_token) {
                    $notify->send($m, [
                        'type'  => $type,
                        'title' => $validated['title'],
                        'body'  => $validated['body'],
                        'data'  => ['source' => 'segment_campaign', 'segment_id' => $segment->id, 'category' => $category],
                    ]);
                    $pushSent++;
                } else {
                    $skipped++;
                }
                if (!empty($validated['send_email']) && $m->email_notifications && $m->user?->email) {
                    Mail::raw($validated['body'], function ($mail) use ($m, $validated) {
                        $mail->to($m->user->email)->subject($validated['title']);
                    });
                    $emailSent++;
                }
            } catch (\Throwable $e) {
                \Log::warning('Segment campaign send failed', [
                    'segment_id' => $segment->id,
                    'member_id'  => $m->id,
                    'error'      => $e->getMessage(),
                ]);
            }
        }

        $segment->forceFill([
            'last_sent_at'     => now(),
            'total_sent_count' => $segment->total_sent_count + $pushSent + $emailSent,
        ])->save();

        AuditLog::record('segment_campaign_sent', $segment, [
            'recipients' => $members->count(),
            'push_sent'  => $pushSent,
            'email_sent' => $emailSent,
            'title'      => $validated['title'],
        ], [], $request->user(),
            "Campaign sent to segment '{$segment->name}' — push: {$pushSent}, email: {$emailSent}");

        return response()->json([
            'total'      => $members->count(),
            'push_sent'  => $pushSent,
            'email_sent' => $emailSent,
            'skipped'    => $skipped,
        ]);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'name'                  => 'required|string|max:120',
            'description'           => 'nullable|string|max:500',
            'definition'            => 'required|array',
            'definition.operator'   => 'sometimes|string|in:AND,OR',
            'definition.filters'    => 'required|array',
            'definition.filters.*.type' => 'required|string',
            'definition.filters.*.op'   => 'required|string',
        ]);
    }

    private function recomputeCount(MemberSegment $segment): void
    {
        try {
            $segment->forceFill([
                'member_count_cached'      => $this->segments->count($segment->definition ?? []),
                'member_count_computed_at' => now(),
            ])->save();
        } catch (\Throwable $e) {
            \Log::warning('Segment count recompute failed', [
                'segment_id' => $segment->id,
                'error'      => $e->getMessage(),
            ]);
        }
    }
}
