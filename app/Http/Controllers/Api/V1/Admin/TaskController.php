<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Task;
use App\Services\Appointments\VenueClock;
use App\Services\CustomFieldService;
use Illuminate\Http\JsonResponse;
use App\Services\Booking\Setup\OwnRows;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

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
    private const LEGACY_TASK_TITLE_LIMIT = 50;

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
            'due_today' => $query->dueToday(VenueClock::zone((int) $request->user()->organization_id))->orderBy('due_at'),
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
            'inquiry_id'           => ['nullable', 'integer', OwnRows::rule('inquiries')],
            'guest_id'             => ['nullable', 'integer', OwnRows::rule('guests')],
            'corporate_account_id' => ['nullable', 'integer', OwnRows::rule('corporate_accounts')],
            'type'                 => 'nullable|string|in:call,email,meeting,whatsapp,sms,video_call,send_proposal,follow_up,site_visit,demo,contract,discovery,custom',
            'title'                => 'required|string|max:200',
            'description'          => 'nullable|string|max:4000',
            'due_at'               => 'nullable|date',
            'assigned_to'          => ['nullable','integer', Rule::exists('users','id')->where('organization_id', $request->user()->organization_id)],
            'custom_data'          => 'nullable|array',
        ] + self::PLAN_RULES);

        $data = self::normalisePlan($data);
        self::assertRepeatHasDay($data['recurring_rule'] ?? null, $data['due_at'] ?? null);
        $data['type']        = $data['type'] ?? 'follow_up';
        if (array_key_exists('due_at', $data)) {
            $data['due_at'] = self::trueInstant($data['due_at']);
        }
        $data['created_by']  = $request->user()->id;
        $data['assigned_to'] = $data['assigned_to'] ?? $request->user()->id;
        $data['custom_data'] = $this->customFields->validate('task', $data['custom_data'] ?? null);

        $task = DB::transaction(function () use ($data) {
            $task = Task::create($data);
            $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);

            // A failed mirror must not leave a saved task behind a 500 response
            // that invites the user to retry and create a duplicate.
            $this->syncInquiryNextTask($task->inquiry_id);

            return $task;
        });

        return response()->json($task, 201);
    }

    /**
     * A task's plan beyond its due time (2026-11-09): its priority, its length and how often it repeats. Before, the full
     * admin's drawer sent these inside `custom_data`, which keeps only the organisation's own custom fields, so none was
     * ever saved.
     */
    private const PLAN_RULES = [
        'priority'            => 'sometimes|nullable|string|in:low,normal,high',
        'duration_minutes'    => 'sometimes|nullable|integer|min:5|max:720',
        'recurring_rule'      => 'sometimes|nullable|array',
        'recurring_rule.freq' => 'required_with:recurring_rule|string|in:daily,weekly,monthly',
    ];

    /** Keep only the repeat's frequency (the rest of a sent rule is not ours to store). */
    private static function normalisePlan(array $data): array
    {
        if (array_key_exists('recurring_rule', $data)) {
            $freq = $data['recurring_rule']['freq'] ?? null;
            $data['recurring_rule'] = $freq ? ['freq' => $freq] : null;
        }

        return $data;
    }

    /** A repeating task needs a day to count from. */
    private static function assertRepeatHasDay(mixed $rule, mixed $dueAt): void
    {
        if (!empty($rule['freq']) && ($dueAt === null || $dueAt === '')) {
            throw \Illuminate\Validation\ValidationException::withMessages(['recurring_rule' => ['A repeating task needs a day.']]);
        }
    }

    /**
     * The next task of a repeating one, made when it is done (2026-11-09): the same task one step later on the venue's
     * clock (a day, a week or a month; the same time of day), moved on until it is ahead of now so finishing an overdue
     * task does not leave its next one overdue too. Made once: the done task keeps the next one's id, and completing it
     * again after a reopen does not make another while that one still exists.
     */
    private function nextOccurrence(Task $task, ?int $by): ?Task
    {
        $freq = $task->recurring_rule['freq'] ?? null;
        if (!$freq || !$task->due_at) {
            return null;
        }
        $made = $task->recurring_rule['next_task_id'] ?? null;
        if ($made && Task::whereKey($made)->exists()) {
            return null;
        }

        $step = fn (\Carbon\CarbonImmutable $at) => match ($freq) {
            'daily'  => $at->addDay(),
            'weekly' => $at->addWeek(),
            default  => $at->addMonthNoOverflow(),
        };
        $at = $step(\Carbon\CarbonImmutable::instance($task->due_at)->setTimezone(VenueClock::zone((int) $task->organization_id)));
        for ($i = 0; $i < 400 && !$at->isFuture(); $i++) {
            $at = $step($at);
        }

        $next = Task::create([
            'organization_id'      => $task->organization_id,
            'brand_id'             => $task->brand_id,
            'inquiry_id'           => $task->inquiry_id,
            'guest_id'             => $task->guest_id,
            'corporate_account_id' => $task->corporate_account_id,
            'type'                 => $task->type,
            'title'                => $task->title,
            'description'          => $task->description,
            'due_at'               => $at->utc()->format('Y-m-d H:i:s'),
            'assigned_to'          => $task->assigned_to,
            'created_by'           => $by,
            'priority'             => $task->priority,
            'duration_minutes'     => $task->duration_minutes,
            'recurring_rule'       => ['freq' => $freq],
            'custom_data'          => $task->custom_data,
        ]);
        $task->forceFill(['recurring_rule' => ['freq' => $freq, 'next_task_id' => $next->id]])->save();

        return $next;
    }

    /**
     * `due_at` is an instant, stored in UTC (2026-11-08). A value with an offset (`Z`, `+02:00`) is converted to UTC
     * before it is saved — the model's datetime cast would otherwise keep its digits and drop the offset, so
     * `10:00+02:00` came back two hours late. A value without an offset keeps its meaning of before: its digits are
     * stored as they are (read as UTC).
     */
    private static function trueInstant(mixed $value): mixed
    {
        if (!is_string($value) || !preg_match('/\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?)$/i', trim($value))) {
            return $value;
        }

        return \Carbon\CarbonImmutable::parse(trim($value))->utc()->format('Y-m-d H:i:s');
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
            // The leads list uses this legacy varchar(50) as a display title.
            // Keep the authoritative task title intact, make shortening visible,
            // and retain the full title in the legacy notes as well.
            $title = $next->title;
            $notes = $next->description;
            if (mb_strlen($title, 'UTF-8') > self::LEGACY_TASK_TITLE_LIMIT) {
                $title = mb_substr($title, 0, self::LEGACY_TASK_TITLE_LIMIT - 1, 'UTF-8').'…';
                $notes = $next->title.($notes === null || $notes === '' ? '' : "\n\n".$notes);
            }

            $inquiry->forceFill([
                'next_task_type'      => $title,
                // A lead's follow-up day is the venue's calendar day of the task's instant (2026-11-08).
                'next_task_due'       => $next->due_at?->copy()->setTimezone(VenueClock::zone((int) $inquiry->organization_id))->toDateString(),
                'next_task_notes'     => $notes,
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
            'assigned_to' => ['sometimes','nullable','integer', Rule::exists('users','id')->where('organization_id', $request->user()->organization_id)],
            'custom_data' => 'sometimes|nullable|array',
        ] + self::PLAN_RULES);

        $data = self::normalisePlan($data);
        self::assertRepeatHasDay(
            array_key_exists('recurring_rule', $data) ? $data['recurring_rule'] : $task->recurring_rule,
            array_key_exists('due_at', $data) ? $data['due_at'] : $task->due_at,
        );
        if (array_key_exists('custom_data', $data)) {
            $data['custom_data'] = $this->customFields->validate('task', $data['custom_data']);
        }
        if (array_key_exists('due_at', $data)) {
            $data['due_at'] = self::trueInstant($data['due_at']);
        }

        DB::transaction(function () use ($task, $data) {
            $task->fill($data)->save();
            $task->load(['assignee:id,name', 'inquiry:id,guest_id,status']);
            $this->syncInquiryNextTask($task->inquiry_id);
        });

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
            'outcome' => 'nullable|string|max:60',
        ]);

        $next = null;
        DB::transaction(function () use ($task, $data, $request, &$next) {
            $task->forceFill([
                'completed_at' => now(),
                'outcome'      => $data['outcome'] ?? null,
            ])->save();
            $next = $this->nextOccurrence($task, $request->user()?->id);

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
        });

        // A repeating task's next one (null otherwise), beside the done task's own fields.
        return response()->json($task->toArray() + ['next_task' => $next?->load(['assignee:id,name', 'inquiry:id,guest_id,status'])]);
    }

    public function reopen(Task $task): JsonResponse
    {
        DB::transaction(function () use ($task) {
            $task->forceFill(['completed_at' => null, 'outcome' => null])->save();
            $this->syncInquiryNextTask($task->inquiry_id);
        });
        return response()->json($task->fresh());
    }

    public function destroy(Task $task): JsonResponse
    {
        DB::transaction(function () use ($task) {
            $inquiryId = $task->inquiry_id;
            $task->delete();
            $this->syncInquiryNextTask($inquiryId);
        });
        return response()->json(['message' => 'Task deleted']);
    }
}
