<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Task;
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
            'type'                 => 'nullable|string|in:call,email,meeting,send_proposal,follow_up,site_visit,custom',
            'title'                => 'required|string|max:200',
            'description'          => 'nullable|string|max:4000',
            'due_at'               => 'nullable|date',
            'assigned_to'          => 'nullable|integer|exists:users,id',
        ]);

        $data['type']        = $data['type'] ?? 'follow_up';
        $data['created_by']  = $request->user()->id;
        $data['assigned_to'] = $data['assigned_to'] ?? $request->user()->id;

        $task = Task::create($data);
        $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);

        return response()->json($task, 201);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        $data = $request->validate([
            'type'        => 'sometimes|string|in:call,email,meeting,send_proposal,follow_up,site_visit,custom',
            'title'       => 'sometimes|string|max:200',
            'description' => 'sometimes|nullable|string|max:4000',
            'due_at'      => 'sometimes|nullable|date',
            'assigned_to' => 'sometimes|nullable|integer|exists:users,id',
        ]);

        $task->fill($data)->save();
        $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);

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
        return response()->json($task);
    }

    public function reopen(Task $task): JsonResponse
    {
        $task->forceFill(['completed_at' => null, 'outcome' => null])->save();
        return response()->json($task->fresh());
    }

    public function destroy(Task $task): JsonResponse
    {
        $task->delete();
        return response()->json(['message' => 'Task deleted']);
    }
}
