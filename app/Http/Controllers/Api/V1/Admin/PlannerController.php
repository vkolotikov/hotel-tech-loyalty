<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\PlannerDayNote;
use App\Models\PlannerSubtask;
use App\Models\PlannerTask;
use App\Models\PlannerTemplate;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlannerController extends Controller
{
    /** Hard cap on how many child tasks a recurring series can spawn. */
    private const RECURRING_MAX_INSTANCES = 90;

    /* ─── Tasks ────────────────────────────────────────────────── */

    public function tasks(Request $request): JsonResponse
    {
        $query = PlannerTask::with('subtasks');

        if ($date = $request->get('date')) {
            $query->where('task_date', $date);
        }
        if ($weekStart = $request->get('week_start')) {
            $query->whereBetween('task_date', [$weekStart, date('Y-m-d', strtotime($weekStart . ' +6 days'))]);
        }
        if (($from = $request->get('from')) && ($to = $request->get('to'))) {
            $query->whereBetween('task_date', [$from, $to]);
        }
        if ($employee = $request->get('employee')) {
            $query->where('employee_name', $employee);
        }
        if ($group = $request->get('task_group')) {
            $query->where('task_group', $group);
        }
        if ($search = $request->get('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'ilike', "%{$search}%")
                  ->orWhere('description', 'ilike', "%{$search}%");
            });
        }

        return response()->json($query->orderBy('task_date')->orderBy('start_time')->get());
    }

    public function storeTask(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_name'        => 'nullable|string|max:150',
            'assigned_to_user_id'  => 'nullable|integer|exists:users,id',
            'title'                => 'required|string|max:200',
            'task_date'            => 'required|date',
            'start_time'           => 'nullable|date_format:H:i',
            'end_time'             => 'nullable|date_format:H:i',
            'status'               => 'nullable|string|max:20',
            'priority'             => 'nullable|string|max:10',
            'task_group'           => 'nullable|string|max:80',
            'task_category'        => 'nullable|string|max:120',
            'duration_minutes'     => 'nullable|integer|min:1',
            'description'          => 'nullable|string',
            'recurring'            => 'nullable|string|in:none,daily,weekly,monthly',
            'recurring_until'      => 'nullable|date|after:task_date',
        ]);

        $validated['status'] = $validated['status'] ?? 'todo';

        // Normalise recurring=none → null so the column stays clean.
        $recurring = $validated['recurring'] ?? null;
        if ($recurring === 'none' || $recurring === '') $recurring = null;
        $validated['recurring'] = $recurring;

        $parent = PlannerTask::create($validated);

        // If recurring, generate up to RECURRING_MAX_INSTANCES child rows
        // upfront. Each child links back via recurring_parent_id so a
        // future "Edit all future" UX can find siblings cheaply.
        if ($recurring) {
            $this->generateRecurringChildren($parent);
        }

        return response()->json($parent->load('subtasks'), 201);
    }

    /**
     * Resolve a task by id, scoped through the BelongsToOrganization
     * global scope. We use explicit binding here instead of Laravel's
     * implicit route-model binding because implicit binding has been
     * a recurring source of mysterious 404s on this codebase (lead-
     * forms hit the same wall in Phase 10) — likely a Laravel Cloud
     * route-cache + binding-resolution interaction. Explicit lookup
     * bypasses the entire mechanism.
     */
    private function resolveTask(int $id): PlannerTask
    {
        return PlannerTask::findOrFail($id);
    }

    private function resolveSubtask(int $id): PlannerSubtask
    {
        return PlannerSubtask::findOrFail($id);
    }

    public function updateTask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $validated = $request->validate([
            'employee_name'        => 'nullable|string|max:150',
            'assigned_to_user_id'  => 'nullable|integer|exists:users,id',
            'title'                => 'sometimes|string|max:200',
            'task_date'            => 'sometimes|date',
            'start_time'           => 'nullable|date_format:H:i',
            'end_time'             => 'nullable|date_format:H:i',
            'status'               => 'nullable|string|max:20',
            'priority'             => 'nullable|string|max:10',
            'task_group'           => 'nullable|string|max:80',
            'task_category'        => 'nullable|string|max:120',
            'duration_minutes'     => 'nullable|integer|min:1',
            'completed'            => 'nullable|boolean',
            'description'          => 'nullable|string',
        ]);

        $taskModel->update($validated);
        return response()->json($taskModel->fresh()->load('subtasks'));
    }

    public function destroyTask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $scope = $request->get('scope', 'just_this'); // just_this | all_future | whole_series

        if ($scope === 'all_future' && ($taskModel->recurring_parent_id || $taskModel->recurring)) {
            $parentId = $taskModel->recurring_parent_id ?? $taskModel->id;
            PlannerTask::where('id', $parentId)
                ->orWhere('recurring_parent_id', $parentId)
                ->where('task_date', '>=', $taskModel->task_date)
                ->delete();
            return response()->json(['message' => 'Future occurrences deleted']);
        }

        if ($scope === 'whole_series' && ($taskModel->recurring_parent_id || $taskModel->recurring)) {
            $parentId = $taskModel->recurring_parent_id ?? $taskModel->id;
            PlannerTask::where('id', $parentId)
                ->orWhere('recurring_parent_id', $parentId)
                ->delete();
            return response()->json(['message' => 'Whole series deleted']);
        }

        $taskModel->delete();
        return response()->json(['message' => 'Task deleted']);
    }

    public function moveTask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $validated = $request->validate([
            'task_date'            => 'required|date',
            'employee_name'        => 'nullable|string|max:150',
            'assigned_to_user_id'  => 'nullable|integer|exists:users,id',
        ]);

        $taskModel->update($validated);
        return response()->json(['success' => true]);
    }

    public function copyTask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $validated = $request->validate([
            'task_date'            => 'required|date',
            'employee_name'        => 'nullable|string|max:150',
            'assigned_to_user_id'  => 'nullable|integer|exists:users,id',
        ]);

        // replicate() doesn't copy timestamps. We exclude completed +
        // recurring fields so a duplicate isn't accidentally part of
        // the original recurring series.
        $copy = $taskModel->replicate(['completed', 'recurring', 'recurring_until', 'recurring_parent_id']);
        $copy->task_date     = $validated['task_date'];
        $copy->employee_name = $validated['employee_name'] ?? $taskModel->employee_name;
        if (array_key_exists('assigned_to_user_id', $validated)) {
            $copy->assigned_to_user_id = $validated['assigned_to_user_id'];
        }
        $copy->completed = false;
        $copy->save();

        foreach ($taskModel->subtasks as $sub) {
            PlannerSubtask::create([
                'task_id' => $copy->id,
                'title'   => $sub->title,
                'is_done' => false,
            ]);
        }

        return response()->json($copy->load('subtasks'), 201);
    }

    public function toggleComplete(int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $newCompleted = !$taskModel->completed;
        $taskModel->update([
            'completed' => $newCompleted,
            'status'    => $newCompleted ? 'done' : 'todo',
        ]);
        return response()->json($taskModel->fresh()->load('subtasks'));
    }

    public function quickStatus(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $validated = $request->validate([
            'status' => 'required|string|in:todo,in_progress,blocked,done',
        ]);
        $taskModel->update([
            'status'    => $validated['status'],
            'completed' => $validated['status'] === 'done',
        ]);
        return response()->json($taskModel->fresh()->load('subtasks'));
    }

    /**
     * POST /v1/admin/planner/tasks/bulk — apply one action to many.
     *
     * Supports: mark_done, mark_todo, set_priority, set_status,
     * reassign_employee, move_date, delete. Always wrapped in a
     * transaction with row locks so a concurrent bulk run + single
     * edit don't fight.
     */
    public function bulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'    => 'required|array|min:1|max:200',
            'ids.*'  => 'integer',
            'action' => 'required|string|in:mark_done,mark_todo,set_priority,set_status,reassign_employee,move_date,delete',
            'value'  => 'nullable|string|max:200',
        ]);

        $count = 0;
        DB::transaction(function () use ($validated, &$count) {
            foreach ($validated['ids'] as $id) {
                $t = PlannerTask::lockForUpdate()->find($id);
                if (!$t) continue;

                $patch = match ($validated['action']) {
                    'mark_done'         => ['completed' => true,  'status' => 'done'],
                    'mark_todo'         => ['completed' => false, 'status' => 'todo'],
                    'set_priority'      => ['priority' => $validated['value'] ?? 'Medium'],
                    'set_status'        => ['status' => $validated['value'] ?? 'todo'],
                    'reassign_employee' => ['employee_name' => $validated['value']],
                    'move_date'         => ['task_date' => $validated['value']],
                    'delete'            => null,
                };

                if ($patch === null) {
                    $t->delete();
                } else {
                    $t->update($patch);
                }
                $count++;
            }
        });

        return response()->json([
            'updated' => $count,
            'message' => "{$count} task" . ($count === 1 ? '' : 's')
                . ' ' . ($validated['action'] === 'delete' ? 'deleted.' : 'updated.'),
        ]);
    }

    /* ─── Subtasks ─────────────────────────────────────────────── */

    public function storeSubtask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $validated = $request->validate(['title' => 'required|string|max:200']);
        $subtask = PlannerSubtask::create([
            'task_id'    => $taskModel->id,
            'title'      => $validated['title'],
            'created_at' => now(),
        ]);
        return response()->json($subtask, 201);
    }

    public function toggleSubtask(int $subtask): JsonResponse
    {
        $subtaskModel = $this->resolveSubtask($subtask);
        $subtaskModel->update(['is_done' => !$subtaskModel->is_done]);
        return response()->json($subtaskModel);
    }

    public function destroySubtask(int $subtask): JsonResponse
    {
        $subtaskModel = $this->resolveSubtask($subtask);
        $subtaskModel->delete();
        return response()->json(['message' => 'Subtask deleted']);
    }

    /* ─── Day notes ────────────────────────────────────────────── */

    public function dayNote(Request $request): JsonResponse
    {
        $date = $request->validate(['date' => 'required|date'])['date'];
        $note = PlannerDayNote::where('note_date', $date)->first();
        return response()->json($note);
    }

    public function upsertDayNote(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'note_date' => 'required|date',
            'note_text' => 'nullable|string',
        ]);

        $note = PlannerDayNote::updateOrCreate(
            ['note_date' => $validated['note_date']],
            ['note_text' => $validated['note_text']]
        );

        return response()->json($note);
    }

    /* ─── Stats ───────────────────────────────────────────────── */

    public function stats(Request $request): JsonResponse
    {
        $from = $request->get('from', now()->startOfMonth()->toDateString());
        $to   = $request->get('to', now()->toDateString());

        $byEmployee = PlannerTask::select('employee_name',
                DB::raw('count(*) as total'),
                DB::raw('sum(case when completed then 1 else 0 end) as completed')
            )
            ->whereBetween('task_date', [$from, $to])
            ->groupBy('employee_name')
            ->get();

        $byGroup = PlannerTask::select('task_group',
                DB::raw('count(*) as total'),
                DB::raw('sum(case when completed then 1 else 0 end) as completed')
            )
            ->whereBetween('task_date', [$from, $to])
            ->whereNotNull('task_group')
            ->groupBy('task_group')
            ->orderByDesc('total')
            ->get();

        return response()->json(['by_employee' => $byEmployee, 'by_group' => $byGroup]);
    }

    /* ─── Templates ────────────────────────────────────────────── */

    public function templates(): JsonResponse
    {
        return response()->json(
            PlannerTemplate::orderBy('category')
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
        );
    }

    public function storeTemplate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'             => 'required|string|max:120',
            'title'            => 'required|string|max:200',
            'category'         => 'nullable|string|max:80',
            'task_group'       => 'nullable|string|max:80',
            'task_category'    => 'nullable|string|max:120',
            'priority'         => 'nullable|string|max:10',
            'duration_minutes' => 'nullable|integer|min:1',
            'description'      => 'nullable|string',
        ]);

        $validated['category'] = $validated['category'] ?? 'General';
        $validated['priority'] = $validated['priority'] ?? 'Medium';
        $maxSort = (int) PlannerTemplate::where('category', $validated['category'])->max('sort_order');
        $validated['sort_order'] = $maxSort + 1;

        $tpl = PlannerTemplate::create($validated);
        return response()->json($tpl, 201);
    }

    public function updateTemplate(Request $request, int $template): JsonResponse
    {
        $tpl = PlannerTemplate::findOrFail($template);
        $validated = $request->validate([
            'name'             => 'sometimes|string|max:120',
            'title'            => 'sometimes|string|max:200',
            'category'         => 'sometimes|string|max:80',
            'task_group'       => 'sometimes|nullable|string|max:80',
            'task_category'    => 'sometimes|nullable|string|max:120',
            'priority'         => 'sometimes|string|max:10',
            'duration_minutes' => 'sometimes|nullable|integer|min:1',
            'description'      => 'sometimes|nullable|string',
            'sort_order'       => 'sometimes|integer',
        ]);

        $tpl->fill($validated)->save();
        return response()->json($tpl->fresh());
    }

    public function destroyTemplate(int $template): JsonResponse
    {
        $tpl = PlannerTemplate::findOrFail($template);
        $tpl->delete();
        return response()->json(['message' => 'Template deleted']);
    }

    /* ─── internals ────────────────────────────────────────────── */

    /**
     * Generate child planner_task rows from a recurring parent. Caps
     * at RECURRING_MAX_INSTANCES instances and at recurring_until.
     * Children share employee, time, group, etc. with the parent;
     * `recurring` itself is NULL on children so they don't try to
     * spawn their own series.
     */
    private function generateRecurringChildren(PlannerTask $parent): void
    {
        if (!$parent->recurring) return;

        $start = Carbon::parse($parent->task_date);
        $end = $parent->recurring_until
            ? Carbon::parse($parent->recurring_until)
            : $start->copy()->addDays(self::RECURRING_MAX_INSTANCES);

        $cursor = $start->copy();
        $generated = 0;

        while ($generated < self::RECURRING_MAX_INSTANCES) {
            $cursor = match ($parent->recurring) {
                'daily'   => $cursor->copy()->addDay(),
                'weekly'  => $cursor->copy()->addWeek(),
                'monthly' => $cursor->copy()->addMonth(),
                default   => null,
            };
            if (!$cursor || $cursor->gt($end)) break;

            PlannerTask::create([
                'employee_name'        => $parent->employee_name,
                'assigned_to_user_id'  => $parent->assigned_to_user_id,
                'title'                => $parent->title,
                'task_date'            => $cursor->toDateString(),
                'start_time'           => $parent->start_time,
                'end_time'             => $parent->end_time,
                'status'               => 'todo',
                'priority'             => $parent->priority,
                'task_group'           => $parent->task_group,
                'task_category'        => $parent->task_category,
                'duration_minutes'     => $parent->duration_minutes,
                'description'          => $parent->description,
                'recurring_parent_id'  => $parent->id,
                // children DO NOT carry the `recurring` flag — only the
                // parent does. Avoids cascading regeneration.
            ]);
            $generated++;
        }
    }

    /* ─── Auto-plan (smart-fit unscheduled tasks into the day) ─── */

    /**
     * Returns a proposal that fits today's UNSCHEDULED tasks
     * (start_time IS NULL) into available slots between work-start
     * and work-end, in priority order. Nothing is mutated — the
     * frontend renders the proposal in a preview modal and POSTs
     * to /auto-plan/apply to commit. Deterministic by design so
     * the same input always produces the same plan; a future LLM
     * variant can swap in here without changing the API shape.
     */
    public function autoPlanDay(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date'          => 'required|date_format:Y-m-d',
            'employee_name' => 'nullable|string|max:120',
            'work_start'    => 'nullable|regex:/^\d{2}:\d{2}$/',
            'work_end'      => 'nullable|regex:/^\d{2}:\d{2}$/',
        ]);

        $date = $data['date'];
        $employee = $data['employee_name'] ?? null;
        $workStartMin = $this->hhmmToMin($data['work_start'] ?? '09:00');
        $workEndMin = $this->hhmmToMin($data['work_end'] ?? '18:00');

        // Priority weight — High first, then Normal, then Low.
        $priorityOrder = ['High' => 0, 'Normal' => 1, 'Low' => 2];

        $tasksQuery = PlannerTask::where('task_date', $date)->where('completed', false);
        if ($employee) $tasksQuery->where('employee_name', $employee);
        $tasks = $tasksQuery->get();

        // Build busy ranges from already-scheduled tasks. Sorted by
        // start so the slot-finder can advance through them in one
        // pass.
        $busy = $tasks->filter(fn($t) => $t->start_time !== null)
            ->map(function ($t) {
                $start = $this->hhmmToMin(substr($t->start_time, 0, 5));
                $duration = (int) ($t->duration_minutes ?? 30);
                return ['start' => $start, 'end' => $start + $duration];
            })
            ->sortBy('start')
            ->values()
            ->all();

        // Sort unscheduled tasks by priority then created_at so the
        // result is stable. Tasks without a duration default to 30
        // min for slotting purposes (the actual stored value isn't
        // touched).
        $unscheduled = $tasks->filter(fn($t) => $t->start_time === null)
            ->sortBy([
                fn($a, $b) => ($priorityOrder[$a->priority] ?? 1) <=> ($priorityOrder[$b->priority] ?? 1),
                fn($a, $b) => strcmp((string)$a->created_at, (string)$b->created_at),
            ])
            ->values();

        $proposals = [];
        $skipped = [];
        $cursor = $workStartMin;

        foreach ($unscheduled as $t) {
            $duration = max(15, (int) ($t->duration_minutes ?? 30));

            // Advance cursor past any busy window that overlaps the
            // candidate slot [cursor, cursor+duration). Loop in case
            // a single advance lands in another busy block.
            $tries = 0;
            while ($tries++ < count($busy) + 2) {
                $hit = null;
                foreach ($busy as $b) {
                    if ($b['start'] < $cursor + $duration && $b['end'] > $cursor) {
                        $hit = $b;
                        break;
                    }
                }
                if (!$hit) break;
                $cursor = $hit['end'];
            }

            if ($cursor + $duration > $workEndMin) {
                $skipped[] = [
                    'task_id' => $t->id,
                    'title'   => $t->title,
                    'reason'  => 'No room left in working hours',
                ];
                continue;
            }

            $hh = (int) floor($cursor / 60);
            $mm = $cursor % 60;
            $proposals[] = [
                'task_id'           => $t->id,
                'title'             => $t->title,
                'task_group'        => $t->task_group,
                'priority'          => $t->priority,
                'duration_minutes'  => $duration,
                'start_time'        => sprintf('%02d:%02d', $hh, $mm),
            ];

            // Add this proposal to busy so subsequent fits respect
            // it; resort to keep the loop's first-overlap check
            // monotonic.
            $busy[] = ['start' => $cursor, 'end' => $cursor + $duration];
            usort($busy, fn($a, $b) => $a['start'] <=> $b['start']);

            $cursor += $duration;
        }

        return response()->json([
            'proposals' => $proposals,
            'skipped'   => $skipped,
            'work'      => [
                'start' => sprintf('%02d:%02d', intdiv($workStartMin, 60), $workStartMin % 60),
                'end'   => sprintf('%02d:%02d', intdiv($workEndMin, 60), $workEndMin % 60),
            ],
        ]);
    }

    /**
     * Commits a previously-returned proposal. Trusts the caller to
     * send the array unmodified — but each row is validated and the
     * matching task is loaded fresh, so out-of-band changes between
     * preview and apply (e.g. someone else scheduled the task)
     * can't be overwritten silently — we skip those.
     */
    public function autoPlanApply(Request $request): JsonResponse
    {
        $data = $request->validate([
            'proposals'                       => 'required|array|max:200',
            'proposals.*.task_id'             => 'required|integer',
            'proposals.*.start_time'          => 'required|regex:/^\d{2}:\d{2}$/',
            'proposals.*.duration_minutes'    => 'nullable|integer|min:5|max:1440',
        ]);

        $applied = 0;
        $skipped = 0;

        DB::transaction(function () use ($data, &$applied, &$skipped) {
            foreach ($data['proposals'] as $p) {
                $task = PlannerTask::find($p['task_id']);
                if (!$task || $task->start_time !== null) {
                    // Task vanished, or someone scheduled it
                    // between preview + apply.
                    $skipped++;
                    continue;
                }
                $update = ['start_time' => $p['start_time'] . ':00'];
                if (!empty($p['duration_minutes'])) {
                    $update['duration_minutes'] = (int) $p['duration_minutes'];
                }
                $task->update($update);
                $applied++;
            }
        });

        return response()->json(['applied' => $applied, 'skipped' => $skipped]);
    }

    private function hhmmToMin(string $hhmm): int
    {
        [$h, $m] = array_pad(explode(':', $hhmm), 2, '0');
        return ((int) $h) * 60 + ((int) $m);
    }
}
