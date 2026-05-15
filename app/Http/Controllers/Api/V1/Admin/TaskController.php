<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Task;
use App\Services\CustomFieldService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * First-class task CRUD. Powers:
 *   - the lead-detail Tasks panel (filter by inquiry_id)
 *   - the standalone Tasks page that ships in CRM Phase 3
 *   - the Today bar's Overdue / Due Today / Due Soon counters
 *
 * Marking a task complete writes a sibling Activity(type=task_completed)
 * on the inquiry so the work shows up in the timeline without callers
 * needing to remember to log it twice.
 */
class TaskController extends Controller
{
    public function __construct(protected CustomFieldService $customFields) {}

    public function index(Request $request): JsonResponse
    {
        $params = $request->validate([
            'inquiry_id'  => 'nullable|integer',
            'assigned_to' => 'nullable|integer',
            'status'      => 'nullable|string|in:open,overdue,due_today,due_soon,completed,all',
            'per_page'    => 'nullable|integer|min:1|max:200',
        ]);

        $query = Task::query();

        if (!empty($params['inquiry_id']))  $query->where('inquiry_id', $params['inquiry_id']);
        if (!empty($params['assigned_to'])) $query->where('assigned_to', $params['assigned_to']);

        $status = $params['status'] ?? 'open';
        match ($status) {
            'open'      => $query->open()->orderByRaw('due_at IS NULL')->orderBy('due_at'),
            'overdue'   => $query->overdue()->orderBy('due_at'),
            'due_today' => $query->dueToday()->orderBy('due_at'),
            'due_soon'  => $query->whereNull('completed_at')
                                  ->whereBetween('due_at', [now(), now()->addDays(3)])
                                  ->orderBy('due_at'),
            'completed' => $query->whereNotNull('completed_at')->orderByDesc('completed_at'),
            'all'       => $query->orderBy('due_at'),
            default     => $query->open()->orderBy('due_at'),
        };

        $tasks = $query->with(['assignee:id,name', 'inquiry:id,guest_id,status'])
            ->paginate($params['per_page'] ?? 50);

        return response()->json([
            'data' => $tasks->items(),
            'meta' => [
                'current_page' => $tasks->currentPage(),
                'last_page'    => $tasks->lastPage(),
                'total'        => $tasks->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'inquiry_id'           => 'nullable|integer|exists:inquiries,id',
            'guest_id'             => 'nullable|integer|exists:guests,id',
            'corporate_account_id' => 'nullable|integer|exists:corporate_accounts,id',
            'type'                 => 'nullable|string|in:call,email,meeting,whatsapp,sms,video_call,send_proposal,follow_up,site_visit,demo,contract,discovery,custom',
            'title'                => 'required|string|max:200',
            'description'          => 'nullable|string|max:4000',
            'due_at'               => 'nullable|date',
            'assigned_to'          => 'nullable|integer|exists:users,id',
            'custom_data'          => 'nullable|array',
        ]);

        $data['type']        = $data['type'] ?? 'follow_up';
        $data['created_by']  = $request->user()->id;
        $data['assigned_to'] = $data['assigned_to'] ?? $request->user()->id;
        $data['custom_data'] = $this->customFields->validate('task', $data['custom_data'] ?? null);

        $task = Task::create($data);
        $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);

        // Mirror to the linked inquiry's denormalised next-task columns
        // so the leads list row updates immediately. The Inquiries page
        // reads next_task_type/due/notes off the inquiry row (no join);
        // without this sync, freshly-created tasks are invisible there.
        $this->syncInquiryNextTask($task->inquiry_id);

        return response()->json($task, 201);
    }

    /**
     * Refresh inquiry.next_task_* from the earliest-due open task
     * linked to it. Called on task create / update / complete / delete.
     */
    protected function syncInquiryNextTask(?int $inquiryId): void
    {
        if (!$inquiryId) return;
        $inquiry = \App\Models\Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->find($inquiryId);
        if (!$inquiry) return;

        $next = Task::where('inquiry_id', $inquiryId)
            ->whereNull('completed_at')
            ->orderByRaw('due_at IS NULL, due_at ASC')
            ->first();

        if ($next) {
            $inquiry->forceFill([
                'next_task_type'      => $next->title,
                'next_task_due'       => $next->due_at?->toDateString(),
                'next_task_notes'     => $next->description,
                'next_task_completed' => false,
            ])->save();
        } else {
            $inquiry->forceFill([
                'next_task_type'      => null,
                'next_task_due'       => null,
                'next_task_notes'     => null,
                'next_task_completed' => false,
            ])->save();
        }
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $data = $request->validate([
            'type'        => 'sometimes|string|in:call,email,meeting,whatsapp,sms,video_call,send_proposal,follow_up,site_visit,demo,contract,discovery,custom',
            'title'       => 'sometimes|string|max:200',
            'description' => 'sometimes|nullable|string|max:4000',
            'due_at'      => 'sometimes|nullable|date',
            'assigned_to' => 'sometimes|nullable|integer|exists:users,id',
            'custom_data' => 'sometimes|nullable|array',
        ]);

        if (array_key_exists('custom_data', $data)) {
            $data['custom_data'] = $this->customFields->validate('task', $data['custom_data']);
        }

        $task->fill($data)->save();
        $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);
        $this->syncInquiryNextTask($task->inquiry_id);

        return response()->json($task);
    }

    /**
     * Mark a task complete + log an activity into the inquiry timeline.
     * Keeping these as one endpoint prevents the timeline from drifting
     * out of sync when a caller forgets to write the activity.
     */
    public function complete(Request $request, Task $task): JsonResponse
    {
        if ($task->completed_at !== null) {
            return response()->json($task);
        }

        $data = $request->validate([
            'outcome' => 'nullable|string|max:200',
        ]);

        $task->forceFill([
            'completed_at' => now(),
            'outcome'      => $data['outcome'] ?? null,
        ])->save();

        if ($task->inquiry_id) {
            Activity::create([
                'organization_id' => $task->organization_id,
                'brand_id'        => $task->brand_id,
                'inquiry_id'      => $task->inquiry_id,
                'type'            => 'task_completed',
                'subject'         => $task->title,
                'body'            => $data['outcome'] ?? null,
                'metadata'        => ['task_id' => $task->id, 'task_type' => $task->type],
                'created_by'      => $request->user()->id,
                'occurred_at'     => now(),
            ]);
        }

        $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);
        $this->syncInquiryNextTask($task->inquiry_id);
        return response()->json($task);
    }

    public function reopen(Task $task): JsonResponse
    {
        $task->forceFill(['completed_at' => null, 'outcome' => null])->save();
        $this->syncInquiryNextTask($task->inquiry_id);
        return response()->json($task->fresh());
    }

    public function destroy(Task $task): JsonResponse
    {
        $inquiryId = $task->inquiry_id;
        $task->delete();
        $this->syncInquiryNextTask($inquiryId);
        return response()->json(['message' => 'Task deleted']);
    }
}
