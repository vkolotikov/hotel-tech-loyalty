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
            // Nullable: backlog tasks live without a date until someone
            // schedules them by dragging onto a day cell.
            'task_date'            => 'nullable|date',
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
            // Accept null so editor / drag-to-backlog can unschedule.
            'task_date'            => 'sometimes|nullable|date',
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
            // Nullable so the same endpoint supports drag-back-to-backlog.
            // When null, the task drops out of every calendar view and
            // resurfaces in the sidebar backlog drawer.
            'task_date'            => 'nullable|date',
            'employee_name'        => 'nullable|string|max:150',
            'assigned_to_user_id'  => 'nullable|integer|exists:users,id',
            'start_time'           => 'nullable|date_format:H:i',
        ]);

        // When unscheduling (task_date=null), also clear start_time —
        // a backlog task with a leftover start_time would re-render at a
        // weird position the moment it's scheduled again.
        if (array_key_exists('task_date', $validated) && $validated['task_date'] === null) {
            $validated['start_time'] = null;
            $validated['end_time']   = null;
        }

        $taskModel->update($validated);
        return response()->json(['success' => true]);
    }

    /* ─── Backlog (unscheduled tasks) ──────────────────────────────────
     *
     * A task with task_date IS NULL lives in the "backlog". Two scopes:
     *   - mine: assigned to current user, no date yet — their private
     *           todo bucket that they'll schedule onto specific days
     *   - pool: nobody assigned, no date — the company-wide pool that
     *           any staff member can claim into their own bucket
     *
     * Returned newest-first so a freshly-thrown-in task lands on top.
     */
    public function backlog(Request $request): JsonResponse
    {
        $scope = $request->get('scope', 'mine');

        // Team mode: managers see one bucket per active staff member +
        // the unassigned pool, in a single payload so they can compare
        // workloads at a glance. Other scopes return a flat array of
        // tasks; this one returns a grouped object.
        if ($scope === 'team') {
            $user = $request->user();
            if (!$user) return response()->json(['error' => 'Not authenticated'], 401);
            $staff = $user->organization_id
                ? \App\Models\Staff::withoutGlobalScopes()
                    ->where('user_id', $user->id)
                    ->where('organization_id', $user->organization_id)
                    ->first(['role'])
                : null;
            if (!$staff || !$staff->isManager()) {
                return response()->json(['error' => 'Team view is for managers'], 403);
            }

            // Active staff with at least the user_id link, ordered by
            // name so the columns are stable across renders.
            $staffRows = \App\Models\Staff::withoutGlobalScopes()
                ->with('user:id,name,email,avatar_url')
                ->where('organization_id', $user->organization_id)
                ->where('is_active', true)
                ->whereNotNull('user_id')
                ->get(['id', 'user_id'])
                ->sortBy(fn ($s) => $s->user?->name ?? 'zzz')
                ->values();

            // Single query for every unscheduled task in the org.
            $all = PlannerTask::with('subtasks')->whereNull('task_date')->get();

            $buckets = $staffRows->map(function ($s) use ($all) {
                $uid = $s->user_id;
                $name = $s->user?->name ?? '';
                $bucket = $all->filter(fn ($t) =>
                    $t->assigned_to_user_id === $uid
                    || ($t->employee_name && $t->employee_name === $name)
                )->values();
                return [
                    'user_id'    => $uid,
                    'user_name'  => $name,
                    'avatar_url' => $s->user?->avatar_url,
                    'tasks'      => $bucket,
                ];
            });

            $pool = $all->filter(fn ($t) =>
                $t->assigned_to_user_id === null
                && empty($t->employee_name)
            )->values();

            return response()->json([
                'pool'    => $pool,
                'buckets' => $buckets,
            ]);
        }

        $query = PlannerTask::with('subtasks')->whereNull('task_date');

        if ($scope === 'pool') {
            $query->whereNull('assigned_to_user_id')
                  ->where(function ($q) {
                      $q->whereNull('employee_name')->orWhere('employee_name', '');
                  });

            // Skill filter: if the current user has a non-null
            // staff.planner_skills allowlist, only show pool tasks whose
            // task_group is in it. NULL skills = "no restriction" (default
            // behaviour, preserves existing orgs). Empty array = "this
            // user can't claim anything" — returns zero pool tasks.
            // Tasks with NULL task_group are visible to everyone since
            // there's nothing to gate against.
            $user = $request->user();
            $staff = $user?->organization_id
                ? \App\Models\Staff::withoutGlobalScopes()
                    ->where('user_id', $user->id)
                    ->where('organization_id', $user->organization_id)
                    ->first(['planner_skills', 'role'])
                : null;
            $skills = $staff?->planner_skills;
            $isManager = $staff?->isManager() ?? false;
            if (is_array($skills) && !$isManager) {
                // Managers + super_admins see the full pool regardless of
                // skills — they're the ones who triage the unclaimed work.
                $query->where(function ($q) use ($skills) {
                    $q->whereNull('task_group')
                      ->orWhereIn('task_group', $skills);
                });
            }
        } else {
            // "mine" — assigned to the current user. Match on either the
            // FK or the legacy employee_name string so older rows still
            // surface for the assignee.
            $user = $request->user();
            if (!$user) return response()->json([]);
            $query->where(function ($q) use ($user) {
                $q->where('assigned_to_user_id', $user->id);
                if ($user->name) {
                    $q->orWhere('employee_name', $user->name);
                }
            });
        }

        return response()->json(
            $query->orderByDesc('created_at')->limit(200)->get()
        );
    }

    /**
     * POST /v1/admin/planner/tasks/{id}/claim — pull a pool task into
     * the current user's bucket. Idempotent on already-claimed tasks
     * belonging to the same user; refuses to steal a task that's
     * already assigned to someone else (returns 409 so the UI can
     * refetch and surface the actual owner).
     */
    public function claimTask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $user = $request->user();
        if (!$user) return response()->json(['error' => 'Not authenticated'], 401);

        if ($taskModel->assigned_to_user_id && $taskModel->assigned_to_user_id !== $user->id) {
            return response()->json([
                'error' => 'Task is already assigned to another user',
                'assigned_to_user_id' => $taskModel->assigned_to_user_id,
                'employee_name'       => $taskModel->employee_name,
            ], 409);
        }

        // Skill gate: matches the backlog list filter so a user can't
        // discover a task they can't see and POST /claim directly. Same
        // exemption for managers as in backlog() above.
        $staff = $user->organization_id
            ? \App\Models\Staff::withoutGlobalScopes()
                ->where('user_id', $user->id)
                ->where('organization_id', $user->organization_id)
                ->first(['planner_skills', 'role'])
            : null;
        $skills = $staff?->planner_skills;
        $isManager = $staff?->isManager() ?? false;
        if (
            is_array($skills)
            && !$isManager
            && $taskModel->task_group
            && !in_array($taskModel->task_group, $skills, true)
        ) {
            return response()->json([
                'error' => 'You do not have the skills configured to claim this task',
                'required_skill' => $taskModel->task_group,
            ], 403);
        }

        $taskModel->update([
            'assigned_to_user_id' => $user->id,
            'employee_name'       => $user->name ?: $taskModel->employee_name,
        ]);

        return response()->json($taskModel->fresh()->load('subtasks'));
    }

    /**
     * POST /v1/admin/planner/tasks/{id}/release — send a task back to
     * the open pool. Only the current assignee or a user with manager
     * perms can release; otherwise random staff could yank tasks off
     * a colleague's bucket.
     */
    public function releaseTask(Request $request, int $task): JsonResponse
    {
        $taskModel = $this->resolveTask($task);
        $user = $request->user();
        if (!$user) return response()->json(['error' => 'Not authenticated'], 401);

        $isAssignee = $taskModel->assigned_to_user_id === $user->id;
        $isManager  = method_exists($user, 'hasRole')
            ? ($user->hasRole('super_admin') || $user->hasRole('manager'))
            : false;
        if (!$isAssignee && !$isManager) {
            return response()->json(['error' => 'Only the assignee or a manager can release this task'], 403);
        }

        $taskModel->update([
            'assigned_to_user_id' => null,
            'employee_name'       => null,
        ]);

        return response()->json($taskModel->fresh()->load('subtasks'));
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
        // Phase 5 — fallback chain: request payload → org's
        // business_hours_profile → 09:00/18:00 hardcode. Hotel orgs
        // backfilled to 09:00/18:00 so no behavioural change.
        $win = $this->resolveWorkWindow($data);
        $workStartMin = $win['start'];
        $workEndMin   = $win['end'];

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

    /**
     * Industry Platform Plan Phase 5 — resolve the day's work window.
     *
     * Precedence:
     *   1. Explicit request payload (`work_start` / `work_end` HH:MM)
     *      — preserves the existing API contract.
     *   2. Org's `crm_settings.business_hours_profile` row — set by the
     *      Phase 5 backfill migration to `{start:'09:00', end:'18:00'}`
     *      for every existing org (no silent retiming) and re-written
     *      by future per-industry default seeders (Phase 5.x for the
     *      taxonomy + admin UI).
     *   3. Hardcoded `09:00` / `18:00` fallback — same as before this
     *      helper existed; only reachable if both the request and the
     *      crm_settings row are missing or malformed.
     *
     * **Forward-compat contract**: business_hours_profile rows MUST
     * always carry top-level `start` + `end` HH:MM strings, even when
     * future per-DOW schedules (Tue-Sat) or lunch breaks are added as
     * sibling keys. These top-level values act as the simple-fallback
     * window for callers that don't yet understand richer schedules.
     * The auto-planner / free-slots / suggest-staff endpoints read
     * these flat keys ONLY today.
     *
     * **Tenant binding required**. CrmSetting uses
     * `BelongsToOrganization` — `current_organization_id` MUST be
     * bound by tenant middleware before this helper runs. Callers
     * outside the HTTP request lifecycle (artisan commands, queue
     * workers) get the explicit-payload-or-hardcoded path so a
     * console misconfiguration can't silently retime the planner.
     *
     * @return array{start:int,end:int}  Minute offsets from 00:00.
     */
    private function resolveWorkWindow(array $data): array
    {
        $hhmm = '/^\d{2}:\d{2}$/';

        // Tier 1: explicit request payload wins. Already regex-validated
        // by the parent endpoint's request->validate() — keep treating
        // it as trusted.
        $requestStart = $data['work_start'] ?? null;
        $requestEnd   = $data['work_end']   ?? null;

        // Short-circuit when tenant context is missing. Falling through
        // to the CrmSetting query under TenantScope's fail-closed
        // semantics would silently return the hardcoded 09:00/18:00
        // window with no log signal — a CLI / queue / cron caller would
        // mis-plan without anyone noticing. Skip straight to tier 3.
        if (!app()->bound('current_organization_id') || !app('current_organization_id')) {
            return [
                'start' => $this->hhmmToMin($requestStart ?: '09:00'),
                'end'   => $this->hhmmToMin($requestEnd   ?: '18:00'),
            ];
        }

        // Tier 2: org's saved profile. JSON-cast row {start,end} read
        // through the tenant-scoped CrmSetting model. Falls through if
        // the row is missing, malformed, or has bad-format values.
        $profileStart = null;
        $profileEnd   = null;
        try {
            $row = \App\Models\CrmSetting::where('key', 'business_hours_profile')->first();
            $val = $row?->value;
            if (is_array($val)) {
                $rawStart = is_string($val['start'] ?? null) ? $val['start'] : null;
                $rawEnd   = is_string($val['end']   ?? null) ? $val['end']   : null;
                // Re-validate HH:MM format. An admin who hand-edited
                // their crm_settings row could leave '9' or '9:00 AM'
                // — hhmmToMin would silently accept those, producing a
                // wrong-but-plausible work window. Strict regex matches
                // the per-request validator (apps/loyalty/backend/.../
                // PlannerController.php $data['work_start'] regex).
                $profileStart = ($rawStart !== null && preg_match($hhmm, $rawStart)) ? $rawStart : null;
                $profileEnd   = ($rawEnd   !== null && preg_match($hhmm, $rawEnd))   ? $rawEnd   : null;

                if (($rawStart !== null && $profileStart === null) || ($rawEnd !== null && $profileEnd === null)) {
                    \Log::warning('planner.work_window.profile_malformed', [
                        'org_id' => app('current_organization_id'),
                        'value'  => $val,
                    ]);
                }
            }
        } catch (\Throwable $e) {
            // CrmSetting query failed (table missing in a fresh test env,
            // transient Postgres hiccup, schema drift). Log so the
            // fall-through to the hardcoded default isn't silent.
            \Log::warning('planner.work_window.profile_lookup_failed', [
                'org_id' => app('current_organization_id'),
                'error'  => $e->getMessage(),
            ]);
        }

        return [
            'start' => $this->hhmmToMin($requestStart ?: $profileStart ?: '09:00'),
            'end'   => $this->hhmmToMin($requestEnd   ?: $profileEnd   ?: '18:00'),
        ];
    }

    /**
     * GET /v1/admin/planner/free-slots
     *
     * Compute free time intervals on a date for an optional employee.
     * Returns each gap as { start: 'HH:MM', end: 'HH:MM', minutes }
     * within the work window. Inverse of autoPlanDay's busy scan.
     *
     * Shipped for the voice agent's day-planning playbook: "When can
     * I fit a 90-min meeting with Anna tomorrow?" → AI reads back the
     * free slots without having to call auto-plan.
     */
    public function freeSlots(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date'                  => 'required|date_format:Y-m-d',
            'employee_name'         => 'nullable|string|max:120',
            'work_start'            => 'nullable|regex:/^\d{2}:\d{2}$/',
            'work_end'              => 'nullable|regex:/^\d{2}:\d{2}$/',
            'min_duration_minutes'  => 'nullable|integer|min:5|max:1440',
        ]);

        // Phase 5 — same precedence as autoPlanDay.
        $win = $this->resolveWorkWindow($data);
        $workStartMin = $win['start'];
        $workEndMin   = $win['end'];
        $minMinutes   = (int) ($data['min_duration_minutes'] ?? 15);

        $q = PlannerTask::query()
            ->where('task_date', $data['date'])
            ->where('completed', false)
            ->whereNotNull('start_time');
        if (!empty($data['employee_name'])) {
            $q->where('employee_name', $data['employee_name']);
        }

        $busy = $q->get()
            ->map(function ($t) {
                $start = $this->hhmmToMin(substr((string) $t->start_time, 0, 5));
                $duration = (int) ($t->duration_minutes ?? 30);
                return ['start' => $start, 'end' => $start + $duration];
            })
            ->sortBy('start')
            ->values()
            ->all();

        // Merge overlapping busy ranges so the inversion below is clean.
        $merged = [];
        foreach ($busy as $b) {
            if (!empty($merged) && $b['start'] <= end($merged)['end']) {
                $merged[count($merged) - 1]['end'] = max(end($merged)['end'], $b['end']);
            } else {
                $merged[] = $b;
            }
        }

        $slots = [];
        $cursor = $workStartMin;
        foreach ($merged as $b) {
            $gap = $b['start'] - $cursor;
            if ($gap >= $minMinutes) {
                $slots[] = [
                    'start'   => sprintf('%02d:%02d', intdiv($cursor, 60), $cursor % 60),
                    'end'     => sprintf('%02d:%02d', intdiv($b['start'], 60), $b['start'] % 60),
                    'minutes' => $gap,
                ];
            }
            $cursor = max($cursor, $b['end']);
        }
        if ($workEndMin - $cursor >= $minMinutes) {
            $slots[] = [
                'start'   => sprintf('%02d:%02d', intdiv($cursor, 60), $cursor % 60),
                'end'     => sprintf('%02d:%02d', intdiv($workEndMin, 60), $workEndMin % 60),
                'minutes' => $workEndMin - $cursor,
            ];
        }

        return response()->json([
            'date'  => $data['date'],
            'employee_name' => $data['employee_name'] ?? null,
            'work'  => [
                'start' => sprintf('%02d:%02d', intdiv($workStartMin, 60), $workStartMin % 60),
                'end'   => sprintf('%02d:%02d', intdiv($workEndMin, 60), $workEndMin % 60),
            ],
            'slots' => $slots,
            'busy'  => array_map(fn ($b) => [
                'start' => sprintf('%02d:%02d', intdiv($b['start'], 60), $b['start'] % 60),
                'end'   => sprintf('%02d:%02d', intdiv($b['end'], 60), $b['end'] % 60),
            ], $merged),
        ]);
    }

    /**
     * POST /v1/admin/planner/suggest-staff
     *
     * Rank active staff for a given task by skills + same-day capacity.
     * Honour the `staff.planner_skills` jsonb allowlist — null means
     * "claim anything", otherwise the task_group must be in the list.
     * Score is current_free_capacity_minutes desc, with ties broken by
     * last_login_at recency (avoid suggesting a staffer who hasn't
     * logged in in a month).
     */
    public function suggestStaff(Request $request): JsonResponse
    {
        $data = $request->validate([
            'task_group'        => 'required|string|max:80',
            'task_date'         => 'required|date_format:Y-m-d',
            'duration_minutes'  => 'nullable|integer|min:5|max:1440',
            'work_start'        => 'nullable|regex:/^\d{2}:\d{2}$/',
            'work_end'          => 'nullable|regex:/^\d{2}:\d{2}$/',
            'limit'             => 'nullable|integer|min:1|max:25',
        ]);

        // Phase 5 — same precedence as autoPlanDay / freeSlots.
        $win = $this->resolveWorkWindow($data);
        $workStartMin = $win['start'];
        $workEndMin   = $win['end'];
        $windowMin    = max(60, $workEndMin - $workStartMin);
        $duration     = (int) ($data['duration_minutes'] ?? 60);
        $limit        = (int) ($data['limit'] ?? 5);
        $group        = $data['task_group'];

        $staff = \App\Models\Staff::query()
            ->where('is_active', true)
            ->with('user:id,name,email')
            ->get();

        $tasks = PlannerTask::query()
            ->where('task_date', $data['task_date'])
            ->where('completed', false)
            ->whereNotNull('start_time')
            ->get(['employee_name', 'duration_minutes', 'priority']);

        $loadByEmployee = [];
        $highByEmployee = [];
        foreach ($tasks as $t) {
            $name = (string) ($t->employee_name ?? '');
            if ($name === '') continue;
            $loadByEmployee[$name] = ($loadByEmployee[$name] ?? 0) + (int) ($t->duration_minutes ?? 30);
            if (strtolower((string) $t->priority) === 'high') {
                $highByEmployee[$name] = ($highByEmployee[$name] ?? 0) + 1;
            }
        }

        $candidates = [];
        foreach ($staff as $s) {
            // Skill gate — managers + super_admins bypass.
            $isManager = in_array($s->role, ['super_admin', 'manager'], true);
            $skills = is_array($s->planner_skills) ? $s->planner_skills : null;
            $hasSkill = $isManager || $skills === null || in_array($group, $skills, true);
            if (!$hasSkill) {
                continue;
            }

            $name = (string) ($s->user?->name ?? '');
            if ($name === '') continue;
            $usedMin = (int) ($loadByEmployee[$name] ?? 0);
            $freeMin = max(0, $windowMin - $usedMin);
            $highCount = (int) ($highByEmployee[$name] ?? 0);

            // Filter out anyone who simply has no room for the task.
            if ($freeMin < $duration) continue;

            $lastLogin = $s->last_login_at instanceof \Carbon\Carbon
                ? $s->last_login_at->timestamp
                : 0;
            // Score: free capacity (higher = better), break ties by
            // recency of login (more recent = better) and fewer same-
            // day high-priority tasks already on plate.
            $score = $freeMin - ($highCount * 30);
            $reasonBits = [];
            $reasonBits[] = "has {$freeMin} min free today";
            if ($isManager) $reasonBits[] = 'manager';
            elseif ($skills === null) $reasonBits[] = 'no skill restrictions';
            else $reasonBits[] = "skilled in {$group}";
            if ($highCount > 0) $reasonBits[] = "{$highCount} high-priority task" . ($highCount > 1 ? 's' : '') . ' today';

            $candidates[] = [
                'user_id'        => (int) $s->user_id,
                'name'           => $name,
                'role'           => (string) $s->role,
                'free_minutes'   => $freeMin,
                'used_minutes'   => $usedMin,
                'high_priority_count' => $highCount,
                'last_login_at'  => $s->last_login_at?->toIso8601String(),
                'reason'         => implode(' · ', $reasonBits),
                'score'          => $score,
                '_recency'       => $lastLogin,
            ];
        }

        usort($candidates, function ($a, $b) {
            if ($a['score'] !== $b['score']) return $b['score'] <=> $a['score'];
            return $b['_recency'] <=> $a['_recency'];
        });

        $candidates = array_slice($candidates, 0, $limit);
        // Strip internal sort key before responding.
        foreach ($candidates as &$c) unset($c['_recency']);

        return response()->json([
            'task_group'       => $group,
            'task_date'        => $data['task_date'],
            'duration_minutes' => $duration,
            'window'           => [
                'start' => sprintf('%02d:%02d', intdiv($workStartMin, 60), $workStartMin % 60),
                'end'   => sprintf('%02d:%02d', intdiv($workEndMin, 60), $workEndMin % 60),
            ],
            'candidates'       => $candidates,
        ]);
    }

    /**
     * GET /v1/admin/planner/workload-week
     *
     * Per-employee scheduled minutes across a Mon-Sun week, with an
     * `overbooked` flag when any single day exceeds 8h or the week
     * exceeds 40h. Mirrors the Schedule view's workload bar logic so
     * voice answers match what the user sees.
     */
    public function workloadWeek(Request $request): JsonResponse
    {
        $data = $request->validate([
            'week_start' => 'required|date_format:Y-m-d',
        ]);

        $weekStart = \Carbon\Carbon::parse($data['week_start']);
        $weekEnd   = $weekStart->copy()->addDays(6);

        $tasks = PlannerTask::query()
            ->whereBetween('task_date', [$weekStart->toDateString(), $weekEnd->toDateString()])
            ->where('completed', false)
            ->whereNotNull('employee_name')
            ->get(['employee_name', 'task_date', 'duration_minutes']);

        $byEmployee = [];
        foreach ($tasks as $t) {
            $name = (string) $t->employee_name;
            $dayKey = $t->task_date instanceof \Carbon\Carbon
                ? $t->task_date->toDateString()
                : (string) $t->task_date;
            $minutes = (int) ($t->duration_minutes ?? 30);

            if (!isset($byEmployee[$name])) {
                $byEmployee[$name] = [
                    'employee_name'  => $name,
                    'total_minutes'  => 0,
                    'task_count'     => 0,
                    'days'           => [],
                ];
            }
            $byEmployee[$name]['total_minutes'] += $minutes;
            $byEmployee[$name]['task_count']++;
            $byEmployee[$name]['days'][$dayKey] = ($byEmployee[$name]['days'][$dayKey] ?? 0) + $minutes;
        }

        $rows = [];
        foreach ($byEmployee as $emp) {
            $maxDay = empty($emp['days']) ? 0 : max($emp['days']);
            $overbooked = $maxDay > 480 || $emp['total_minutes'] > 2400;
            $emp['max_day_minutes'] = $maxDay;
            $emp['overbooked']      = $overbooked;
            $emp['days']            = array_map(
                fn ($k, $v) => ['date' => $k, 'minutes' => (int) $v],
                array_keys($emp['days']),
                array_values($emp['days']),
            );
            usort($emp['days'], fn ($a, $b) => strcmp($a['date'], $b['date']));
            $rows[] = $emp;
        }

        usort($rows, fn ($a, $b) => $b['total_minutes'] <=> $a['total_minutes']);

        return response()->json([
            'week_start' => $weekStart->toDateString(),
            'week_end'   => $weekEnd->toDateString(),
            'employees'  => $rows,
            'total_employees' => count($rows),
        ]);
    }
}
