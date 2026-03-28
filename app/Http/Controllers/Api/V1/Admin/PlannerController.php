<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\PlannerDayNote;
use App\Models\PlannerSubtask;
use App\Models\PlannerTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PlannerController extends Controller
{
    public function tasks(Request $request): JsonResponse
    {
        $query = PlannerTask::with('subtasks');

        if ($date = $request->get('date')) {
            $query->where('task_date', $date);
        }
        if ($weekStart = $request->get('week_start')) {
            $query->whereBetween('task_date', [$weekStart, date('Y-m-d', strtotime($weekStart . ' +6 days'))]);
        }
        if ($employee = $request->get('employee')) {
            $query->where('employee_name', $employee);
        }
        if ($group = $request->get('task_group')) {
            $query->where('task_group', $group);
        }

        return response()->json($query->orderBy('task_date')->orderBy('start_time')->get());
    }

    public function storeTask(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_name'    => 'nullable|string|max:150',
            'title'            => 'required|string|max:200',
            'task_date'        => 'required|date',
            'start_time'       => 'nullable|date_format:H:i',
            'end_time'         => 'nullable|date_format:H:i',
            'status'           => 'nullable|string|max:20',
            'priority'         => 'nullable|string|max:10',
            'task_group'       => 'nullable|string|max:80',
            'task_category'    => 'nullable|string|max:120',
            'duration_minutes' => 'nullable|integer|min:1',
            'description'      => 'nullable|string',
        ]);

        $task = PlannerTask::create($validated);
        return response()->json($task->load('subtasks'), 201);
    }

    public function updateTask(Request $request, PlannerTask $task): JsonResponse
    {
        $validated = $request->validate([
            'employee_name'    => 'nullable|string|max:150',
            'title'            => 'sometimes|string|max:200',
            'task_date'        => 'sometimes|date',
            'start_time'       => 'nullable|date_format:H:i',
            'end_time'         => 'nullable|date_format:H:i',
            'status'           => 'nullable|string|max:20',
            'priority'         => 'nullable|string|max:10',
            'task_group'       => 'nullable|string|max:80',
            'task_category'    => 'nullable|string|max:120',
            'duration_minutes' => 'nullable|integer|min:1',
            'completed'        => 'nullable|boolean',
            'description'      => 'nullable|string',
        ]);

        $task->update($validated);
        return response()->json($task->fresh()->load('subtasks'));
    }

    public function destroyTask(PlannerTask $task): JsonResponse
    {
        $task->delete();
        return response()->json(['message' => 'Task deleted']);
    }

    public function moveTask(Request $request, PlannerTask $task): JsonResponse
    {
        $validated = $request->validate([
            'task_date'     => 'required|date',
            'employee_name' => 'nullable|string|max:150',
        ]);

        $task->update($validated);
        return response()->json(['success' => true]);
    }

    public function storeSubtask(Request $request, PlannerTask $task): JsonResponse
    {
        $validated = $request->validate(['title' => 'required|string|max:200']);
        $subtask = PlannerSubtask::create([
            'task_id'    => $task->id,
            'title'      => $validated['title'],
            'created_at' => now(),
        ]);
        return response()->json($subtask, 201);
    }

    public function toggleSubtask(PlannerSubtask $subtask): JsonResponse
    {
        $subtask->update(['is_done' => !$subtask->is_done]);
        return response()->json($subtask);
    }

    public function destroySubtask(PlannerSubtask $subtask): JsonResponse
    {
        $subtask->delete();
        return response()->json(['message' => 'Subtask deleted']);
    }

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

    public function copyTask(Request $request, PlannerTask $task): JsonResponse
    {
        $validated = $request->validate([
            'task_date'     => 'required|date',
            'employee_name' => 'nullable|string|max:150',
        ]);

        $copy = $task->replicate(['completed']);
        $copy->task_date     = $validated['task_date'];
        $copy->employee_name = $validated['employee_name'] ?? $task->employee_name;
        $copy->completed     = false;
        $copy->save();

        foreach ($task->subtasks as $sub) {
            PlannerSubtask::create([
                'task_id' => $copy->id,
                'title'   => $sub->title,
                'is_done' => false,
            ]);
        }

        return response()->json($copy->load('subtasks'), 201);
    }

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
}
