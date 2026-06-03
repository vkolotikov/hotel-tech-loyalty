<?php

namespace App\Services;

use App\Models\BookingMirror;
use App\Models\Guest;
use App\Models\Inquiry;
use App\Models\LoyaltyMember;
use App\Models\PlannerTask;
use App\Models\Reservation;
use App\Models\Visitor;
use Illuminate\Support\Facades\Log;

/**
 * Tool registry + executor for the admin AI voice agent.
 *
 * Tools come in two flavours:
 *   1. `getTools()` returns the OpenAI Realtime function-tool schema
 *      injected into the session payload — the model sees these.
 *   2. `execute(name, args, orgId, userId)` runs the named tool and
 *      returns plain PHP arrays. The voice frontend POSTs to
 *      `/v1/admin/crm-ai/voice-tool` per call and forwards the result
 *      back into the WebRTC data channel as a `function_call_output`.
 *
 * Tool semantics:
 *   - All reads run under the caller's bound TenantScope. The
 *     /voice-tool endpoint sits behind Sanctum so $user is authoritative.
 *   - Mutations stay client-confirmed via ConfirmActionModal (Ship 7).
 *     This ship registers READ tools only.
 *   - Return shape is deliberately compact so the model can verbalise
 *     without re-summarising — ISO date strings, lower-case slugs, no
 *     deeply nested objects.
 *   - Errors come back as `{error: "..."}` payloads with the same HTTP
 *     200 status so the model can react instead of the WebRTC channel
 *     dying.
 */
class CrmVoiceToolset
{
    /**
     * Realtime tool roster registered for this ship. Each entry uses the
     * GA `type: function` shape (no MCP yet — Ship 10 may register MCP
     * servers as a sibling type).
     */
    public function getTools(): array
    {
        return [
            [
                'type' => 'function',
                'name' => 'today_snapshot',
                'description' => 'Headline KPIs for today: arrivals, in-house, departures, upcoming PMS bookings, active pipeline value, loyalty members. Use this when the user asks "what is happening today" / "morning briefing" / "snapshot".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => new \stdClass(),
                ],
            ],
            [
                'type' => 'function',
                'name' => 'engagement_pulse',
                'description' => 'Live chat / Messenger / Instagram / WhatsApp engagement state: online visitors, hot leads, conversations waiting for a human, AI-handled count. Use this when the user asks "what is happening in chat right now" or before answering a "do we need to reply to anyone" question.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => new \stdClass(),
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_list_inquiries',
                'description' => 'Search CRM inquiries (sales leads). Supports filter by status (open/won/lost/all), priority, free-text search across subject + guest name + email. Use BEFORE any inquiry mutation tool so you can confirm the right record with the user.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'status' => [
                            'type'        => 'string',
                            'enum'        => ['open', 'won', 'lost', 'all'],
                            'description' => 'Pipeline status filter. Default open.',
                        ],
                        'priority' => [
                            'type' => 'string',
                            'enum' => ['low', 'normal', 'high'],
                        ],
                        'search' => [
                            'type'        => 'string',
                            'description' => 'Free-text search over subject, guest name, guest email.',
                        ],
                        'limit' => [
                            'type'        => 'integer',
                            'minimum'     => 1,
                            'maximum'     => 50,
                            'description' => 'Max rows to return. Default 20.',
                        ],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'planner_list_backlog',
                'description' => 'List unscheduled planner tasks. scope=mine returns tasks assigned to the caller, scope=pool returns the open pool that anyone can claim. Use this as step 1 of the day-planning workflow.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'scope' => [
                            'type' => 'string',
                            'enum' => ['mine', 'pool'],
                            'description' => 'Backlog scope. Default mine. (team scope ships in a later release.)',
                        ],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'get_member',
                'description' => 'Look up a single loyalty member by id, email, or name. Returns tier, current_points, lifetime stats. Use BEFORE award_points or redeem_points so the user can verbally confirm the right person.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'id'    => ['type' => 'integer', 'description' => 'Loyalty member id.'],
                        'email' => ['type' => 'string', 'description' => 'Exact email.'],
                        'name'  => ['type' => 'string', 'description' => 'Partial name (ilike match). Returns the most recent match.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            // ── Ship 5: Planner / day-planning voice tools ─────────────
            [
                'type' => 'function',
                'name' => 'planner_find_free_slots',
                'description' => 'Find free time gaps on a date (and optionally for a specific employee) within the work window. Use this when the user asks "when can I fit X" or "when is Anna free tomorrow".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'date'                 => ['type' => 'string', 'description' => 'ISO date YYYY-MM-DD.'],
                        'employee_name'        => ['type' => 'string', 'description' => 'Restrict to a specific employee.'],
                        'work_start'           => ['type' => 'string', 'description' => 'HH:MM (24h). Default 09:00.'],
                        'work_end'             => ['type' => 'string', 'description' => 'HH:MM (24h). Default 18:00.'],
                        'min_duration_minutes' => ['type' => 'integer', 'minimum' => 5, 'maximum' => 1440, 'description' => 'Minimum gap to surface. Default 15.'],
                    ],
                    'required' => ['date'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'planner_suggest_staff',
                'description' => 'Rank active staff for a task by skill allowlist + same-day capacity. Use BEFORE assigning a task or when the user asks "who should do this".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'task_group'        => ['type' => 'string', 'description' => 'Task group (e.g. Housekeeping, Maintenance, F&B).'],
                        'task_date'         => ['type' => 'string', 'description' => 'ISO date YYYY-MM-DD.'],
                        'duration_minutes'  => ['type' => 'integer', 'minimum' => 5, 'maximum' => 1440, 'description' => 'Expected task duration. Default 60.'],
                        'limit'             => ['type' => 'integer', 'minimum' => 1, 'maximum' => 25, 'description' => 'Max candidates to return. Default 5.'],
                    ],
                    'required' => ['task_group', 'task_date'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'planner_workload_week',
                'description' => 'Per-employee scheduled minutes for a Mon-Sun week with an overbooked flag (>8h any day or >40h total). Use this to answer "who is overbooked this week" or before suggesting reassignments.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'week_start' => ['type' => 'string', 'description' => 'ISO date for Monday of the week (YYYY-MM-DD).'],
                    ],
                    'required' => ['week_start'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'planner_auto_plan_day',
                'description' => 'Deterministic auto-fit of unscheduled tasks into the work window in priority order. apply=false PREVIEWS the proposed schedule; apply=true commits it. ALWAYS call apply=false first and read back the proposal before committing.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'date'          => ['type' => 'string', 'description' => 'ISO date YYYY-MM-DD.'],
                        'employee_name' => ['type' => 'string'],
                        'work_start'    => ['type' => 'string', 'description' => 'HH:MM. Default 09:00.'],
                        'work_end'      => ['type' => 'string', 'description' => 'HH:MM. Default 18:00.'],
                        'apply'         => ['type' => 'boolean', 'description' => 'Default false. When true, commits the previously-computed proposal set.'],
                    ],
                    'required' => ['date'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'planner_move_task',
                'description' => 'Reschedule / reassign / unschedule a planner task. Setting task_date=null moves the task to the backlog. Open-state moves do NOT require user confirmation.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'task_id'             => ['type' => 'integer'],
                        'task_date'           => ['type' => 'string', 'description' => 'ISO date YYYY-MM-DD or null to unschedule.'],
                        'start_time'          => ['type' => 'string', 'description' => 'HH:MM (24h).'],
                        'employee_name'       => ['type' => 'string'],
                        'assigned_to_user_id' => ['type' => 'integer'],
                    ],
                    'required' => ['task_id'],
                    'additionalProperties' => false,
                ],
            ],
        ];
    }

    /**
     * Run a tool by name. Throws ToolUnknown on bad name; everything else
     * returns an array (errors included as `{error: "..."}` payload).
     */
    public function execute(string $name, array $args, int $orgId, int $userId): array
    {
        $method = 'tool_' . preg_replace('/[^a-z0-9_]/i', '', $name);
        if (!method_exists($this, $method)) {
            return ['error' => "Unknown voice tool: {$name}"];
        }

        try {
            return $this->{$method}($args, $orgId, $userId);
        } catch (\Throwable $e) {
            Log::warning('voice_toolset.failed', [
                'tool'    => $name,
                'org_id'  => $orgId,
                'user_id' => $userId,
                'error'   => $e->getMessage(),
            ]);
            return ['error' => 'Tool ' . $name . ' failed: ' . $e->getMessage()];
        }
    }

    // ─── Read tools ───────────────────────────────────────────────────

    private function tool_today_snapshot(array $args, int $orgId, int $userId): array
    {
        $today = now()->toDateString();
        $tomorrow = now()->addDay()->toDateString();

        return [
            'date'             => $today,
            'arrivals_today'   => (int) Reservation::where('check_in', $today)
                ->whereIn('status', ['Confirmed', 'Checked In'])->count(),
            'in_house'         => (int) Reservation::where('status', 'Checked In')->count(),
            'departures_today' => (int) Reservation::where('check_out', $today)
                ->whereIn('status', ['Confirmed', 'Checked In', 'Checked Out'])->count(),
            'arrivals_tomorrow' => (int) Reservation::where('check_in', $tomorrow)
                ->where('status', 'Confirmed')->count(),
            'pms_upcoming'     => (int) BookingMirror::where('arrival_date', '>=', $today)
                ->where('booking_state', '!=', 'cancelled')->count(),
            'pms_outstanding_balance' => round((float) BookingMirror::selectRaw('COALESCE(SUM(price_total), 0) - COALESCE(SUM(price_paid), 0) as bal')->value('bal'), 2),
            'active_inquiries' => (int) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->count(),
            'pipeline_value'   => round((float) Inquiry::whereNotIn('status', ['Confirmed', 'Lost'])->sum('total_value'), 2),
            'guests'           => (int) Guest::count(),
            'members'          => (int) LoyaltyMember::count(),
            'total_points'     => (int) LoyaltyMember::sum('current_points'),
        ];
    }

    private function tool_engagement_pulse(array $args, int $orgId, int $userId): array
    {
        $feed = app(EngagementFeedService::class);

        $kpis = $feed->kpis($orgId);

        $top = $feed->feed($orgId, [
            'filter'   => 'priority',
            'range'    => 'today',
            'per_page' => 8,
        ]);

        $rows = collect($top->items())->map(function ($row) {
            return [
                'visitor_id'        => $row['visitor_id'] ?? ($row['id'] ?? null),
                'display_name'      => $row['display_name'] ?? null,
                'email'             => $row['email'] ?? null,
                'phone'             => $row['phone'] ?? null,
                'country'           => $row['country'] ?? null,
                'is_online'         => (bool) ($row['is_online'] ?? false),
                'is_hot_lead'       => (bool) ($row['is_hot_lead'] ?? false),
                'intent_tag'        => $row['intent_tag'] ?? null,
                'channel'           => $row['channel'] ?? 'widget',
                'last_message_preview' => $row['last_message_preview'] ?? null,
                'last_message_at'   => $row['last_message_at'] ?? null,
                'unread_count'      => (int) ($row['unread_count'] ?? 0),
                'priority_score'    => (int) ($row['priority_score'] ?? 0),
            ];
        })->all();

        return [
            'kpis'         => $kpis,
            'top_priority' => $rows,
            'total_today'  => $top->total(),
        ];
    }

    private function tool_crm_list_inquiries(array $args, int $orgId, int $userId): array
    {
        $limit = max(1, min((int) ($args['limit'] ?? 20), 50));
        $status = strtolower((string) ($args['status'] ?? 'open'));

        $query = Inquiry::query()
            ->with(['guest:id,name,email,phone,company', 'pipelineStage:id,slug,name,kind,color']);

        if ($status === 'open') {
            $query->whereNotIn('status', ['Confirmed', 'Lost']);
        } elseif ($status === 'won') {
            $query->where('status', 'Confirmed');
        } elseif ($status === 'lost') {
            $query->where('status', 'Lost');
        }

        if (!empty($args['priority'])) {
            $priority = ucfirst(strtolower((string) $args['priority']));
            $query->where('priority', $priority);
        }

        if (!empty($args['search'])) {
            $term = '%' . trim((string) $args['search']) . '%';
            $query->where(function ($q) use ($term) {
                $q->where('subject', 'ilike', $term)
                  ->orWhereHas('guest', function ($g) use ($term) {
                      $g->where('name', 'ilike', $term)
                        ->orWhere('email', 'ilike', $term)
                        ->orWhere('phone', 'ilike', $term);
                  });
            });
        }

        $rows = $query->orderByDesc('created_at')->limit($limit)->get();

        return [
            'inquiries' => $rows->map(function (Inquiry $i) {
                return [
                    'id'                  => $i->id,
                    'subject'             => $i->subject,
                    'status'              => $i->status,
                    'stage'               => $i->pipelineStage ? [
                        'slug' => $i->pipelineStage->slug,
                        'name' => $i->pipelineStage->name,
                        'kind' => $i->pipelineStage->kind,
                    ] : null,
                    'priority'            => $i->priority,
                    'total_value'         => $i->total_value,
                    'check_in'            => $i->check_in instanceof \Carbon\Carbon ? $i->check_in->toDateString() : $i->check_in,
                    'check_out'           => $i->check_out instanceof \Carbon\Carbon ? $i->check_out->toDateString() : $i->check_out,
                    'guest'               => $i->guest ? [
                        'id'      => $i->guest->id,
                        'name'    => $i->guest->name,
                        'email'   => $i->guest->email,
                        'phone'   => $i->guest->phone,
                        'company' => $i->guest->company,
                    ] : null,
                    'last_contacted_at'   => $i->last_contacted_at?->toIso8601String(),
                    'ai_win_probability'  => $i->ai_win_probability,
                    'ai_going_cold_risk'  => $i->ai_going_cold_risk,
                    'created_at'          => $i->created_at?->toIso8601String(),
                ];
            })->all(),
            'total' => $rows->count(),
        ];
    }

    private function tool_planner_list_backlog(array $args, int $orgId, int $userId): array
    {
        $scope = strtolower((string) ($args['scope'] ?? 'mine'));
        if (!in_array($scope, ['mine', 'pool'], true)) {
            return ['error' => "Scope must be 'mine' or 'pool' (team scope ships in a later release)."];
        }

        $query = PlannerTask::query()
            ->whereNull('task_date')
            ->where('completed', false);

        if ($scope === 'mine') {
            $query->where('assigned_to_user_id', $userId);
        } else { // pool
            $query->whereNull('assigned_to_user_id');
        }

        $rows = $query
            ->orderByRaw("CASE LOWER(priority) WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END")
            ->orderByDesc('created_at')
            ->limit(50)
            ->get([
                'id', 'title', 'description', 'task_group', 'task_category',
                'priority', 'duration_minutes', 'assigned_to_user_id',
                'employee_name', 'recurring', 'created_at',
            ]);

        return [
            'scope' => $scope,
            'tasks' => $rows->map(fn ($t) => [
                'id'               => $t->id,
                'title'            => $t->title,
                'description'      => $t->description,
                'task_group'       => $t->task_group,
                'task_category'    => $t->task_category,
                'priority'         => $t->priority,
                'duration_minutes' => $t->duration_minutes,
                'employee_name'    => $t->employee_name,
                'recurring'        => $t->recurring,
                'created_at'       => $t->created_at?->toIso8601String(),
            ])->all(),
            'total' => $rows->count(),
        ];
    }

    // ─── Planner voice tools (Ship 5) ─────────────────────────────────
    //
    // These delegate to PlannerController where possible by re-running
    // the existing methods with a synthetic Request. That keeps
    // validation + auto-plan + free-slot algorithms in one place and
    // ensures voice + admin UI return identical shapes.

    private function tool_planner_find_free_slots(array $args, int $orgId, int $userId): array
    {
        $req = new \Illuminate\Http\Request($this->stringifyArgs($args));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\PlannerController::class);
        return $controller->freeSlots($req)->getData(true);
    }

    private function tool_planner_suggest_staff(array $args, int $orgId, int $userId): array
    {
        $req = new \Illuminate\Http\Request($this->stringifyArgs($args));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\PlannerController::class);
        return $controller->suggestStaff($req)->getData(true);
    }

    private function tool_planner_workload_week(array $args, int $orgId, int $userId): array
    {
        $req = new \Illuminate\Http\Request($this->stringifyArgs($args));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\PlannerController::class);
        return $controller->workloadWeek($req)->getData(true);
    }

    private function tool_planner_auto_plan_day(array $args, int $orgId, int $userId): array
    {
        $apply = (bool) ($args['apply'] ?? false);
        unset($args['apply']);
        $req = new \Illuminate\Http\Request($this->stringifyArgs($args));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\PlannerController::class);

        $preview = $controller->autoPlanDay($req)->getData(true);
        if (!$apply) {
            return ['mode' => 'preview'] + $preview;
        }

        // Commit the proposed schedule.
        $applyReq = new \Illuminate\Http\Request([
            'proposals' => array_map(fn ($p) => [
                'task_id'          => $p['task_id'],
                'start_time'       => $p['start_time'],
                'duration_minutes' => $p['duration_minutes'] ?? null,
            ], $preview['proposals'] ?? []),
        ]);
        $applyResult = $controller->autoPlanApply($applyReq)->getData(true);

        return [
            'mode'      => 'applied',
            'proposals' => $preview['proposals'] ?? [],
            'skipped'   => $preview['skipped'] ?? [],
            'work'      => $preview['work'] ?? null,
            'applied'   => $applyResult['applied'] ?? 0,
            'race_skipped' => $applyResult['skipped'] ?? 0,
        ];
    }

    private function tool_planner_move_task(array $args, int $orgId, int $userId): array
    {
        $taskId = (int) ($args['task_id'] ?? 0);
        if ($taskId <= 0) {
            return ['error' => 'task_id is required.'];
        }
        unset($args['task_id']);

        // Coerce nullable task_date — JSON null comes through as PHP null,
        // but Request::all() ignores null entries on stringified input; we
        // need to make sure unschedule semantics survive.
        $payload = [];
        foreach (['task_date', 'start_time', 'employee_name'] as $k) {
            if (array_key_exists($k, $args)) {
                $payload[$k] = $args[$k] === null ? null : (string) $args[$k];
            }
        }
        if (isset($args['assigned_to_user_id'])) {
            $payload['assigned_to_user_id'] = (int) $args['assigned_to_user_id'];
        }

        $req = new \Illuminate\Http\Request($payload);
        $controller = app(\App\Http\Controllers\Api\V1\Admin\PlannerController::class);
        return $controller->moveTask($req, $taskId)->getData(true);
    }

    /**
     * The Request constructor expects scalar query / body values.
     * Convert booleans/nulls to strings so validators don't choke.
     * Plain strings/ints/floats pass through unchanged.
     */
    private function stringifyArgs(array $args): array
    {
        $out = [];
        foreach ($args as $k => $v) {
            if (is_bool($v)) $out[$k] = $v ? '1' : '0';
            elseif ($v === null) continue;
            else $out[$k] = $v;
        }
        return $out;
    }

    private function tool_get_member(array $args, int $orgId, int $userId): array
    {
        $query = LoyaltyMember::query()
            ->with([
                'tier:id,name,min_points,earn_rate',
                'user:id,name,email,phone',
            ]);

        if (!empty($args['id'])) {
            $query->where('id', (int) $args['id']);
        } elseif (!empty($args['email'])) {
            $email = strtolower(trim((string) $args['email']));
            $query->whereHas('user', fn ($q) => $q->whereRaw('LOWER(email) = ?', [$email]));
        } elseif (!empty($args['name'])) {
            $term = '%' . trim((string) $args['name']) . '%';
            $query->whereHas('user', fn ($q) => $q->where('name', 'ilike', $term));
        } else {
            return ['error' => 'Provide one of: id, email, or name.'];
        }

        $member = $query->orderByDesc('id')->first();
        if (!$member) {
            return ['error' => 'Member not found.', 'criteria' => $args];
        }

        return [
            'id'              => $member->id,
            'name'            => $member->user?->name,
            'email'           => $member->user?->email,
            'phone'           => $member->user?->phone,
            'member_number'   => $member->member_number,
            'tier'            => $member->tier ? [
                'id'         => $member->tier->id,
                'name'       => $member->tier->name,
                'min_points' => $member->tier->min_points,
                'earn_rate'  => $member->tier->earn_rate,
            ] : null,
            'current_points'  => (int) $member->current_points,
            'lifetime_points' => (int) $member->lifetime_points,
            'status'          => $member->status ?? null,
            'member_since'    => $member->created_at?->toDateString(),
        ];
    }
}
