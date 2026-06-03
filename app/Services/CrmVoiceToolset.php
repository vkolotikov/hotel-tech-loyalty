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
            // ── Ship 8: Chat / Engagement voice tools ─────────────────
            [
                'type' => 'function',
                'name' => 'engagement_hot_leads',
                'description' => 'List visitors currently flagged as hot leads (captured contact + online OR on /book OR booking_inquiry intent). Use when user asks "any hot leads in chat right now".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'range' => ['type' => 'string', 'enum' => ['today', 'week', 'all'], 'description' => 'Default today.'],
                        'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30, 'description' => 'Default 15.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'engagement_waiting_human',
                'description' => 'Conversations where AI is paused and a visitor message is awaiting a staff reply. The "who needs me right now" question.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'min_wait_minutes' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 1440, 'description' => 'Default 0 (any wait).'],
                        'limit'            => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30, 'description' => 'Default 15.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'engagement_conversation_brief',
                'description' => 'AI-generated brief + intent for a specific chat conversation. Cached 5 min. Use BEFORE replying or taking over from AI.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'conversation_id' => ['type' => 'integer'],
                        'refresh'         => ['type' => 'boolean'],
                    ],
                    'required' => ['conversation_id'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'engagement_summarize_today',
                'description' => 'Engagement day-rollup: total conversations, online visitors, hot-leads count, AI-handled count, unanswered count + top-5 by wait time, channel breakdown (web/messenger/etc).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => new \stdClass(),
                ],
            ],
            [
                'type' => 'function',
                'name' => 'engagement_list_channel',
                'description' => 'Recent conversations on a specific channel (messenger / instagram / whatsapp / widget). Use for "show me recent Messenger DMs" or "any Instagram inquiries".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'channel' => ['type' => 'string', 'enum' => ['widget', 'messenger', 'instagram', 'whatsapp']],
                        'limit'   => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30, 'description' => 'Default 15.'],
                    ],
                    'required' => ['channel'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'engagement_channel_health',
                'description' => 'Status of connected external chat accounts (Messenger / Instagram / WhatsApp Pages): active vs reauth-required, last_webhook_at, last_error, token_expires_at. Use when user asks "are all our channels working".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'channel' => ['type' => 'string', 'enum' => ['messenger', 'instagram', 'whatsapp'], 'description' => 'Optional filter.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            // ── Ship 7: Mutation tools (CONFIRMATION REQUIRED) ─────────
            // The CONFIRM list in VoicePromptBuilder makes the model
            // verbally ask the user before invoking these. The
            // frontend ConfirmActionModal is the safety net for cases
            // where the model decides to skip the ritual.
            [
                'type' => 'function',
                'name' => 'award_points',
                'description' => 'Award loyalty points to a member. CONFIRMATION REQUIRED: read back the member name + amount + reason before invoking. Use get_member first to confirm identity.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'member_id'   => ['type' => 'integer', 'description' => 'Loyalty member id (from get_member).'],
                        'points'      => ['type' => 'integer', 'minimum' => 1, 'maximum' => 1000000, 'description' => 'Points to award.'],
                        'description' => ['type' => 'string', 'description' => 'Spoken reason / note attached to the ledger entry.'],
                    ],
                    'required' => ['member_id', 'points', 'description'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'redeem_points',
                'description' => 'Redeem (deduct) loyalty points from a member balance. CONFIRMATION REQUIRED: read back the member name + amount + reason. Use get_member first to confirm balance >= amount.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'member_id'   => ['type' => 'integer'],
                        'points'      => ['type' => 'integer', 'minimum' => 1, 'maximum' => 1000000],
                        'description' => ['type' => 'string'],
                    ],
                    'required' => ['member_id', 'points', 'description'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_mark_won',
                'description' => 'Mark an inquiry as won. CONFIRMATION REQUIRED. Auto-creates a draft reservation when property + dates are present. Use crm_get_inquiry_brief first.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'inquiry_id' => ['type' => 'integer'],
                        'note'       => ['type' => 'string', 'description' => 'Optional context note saved on the timeline.'],
                    ],
                    'required' => ['inquiry_id'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_mark_lost',
                'description' => 'Mark an inquiry as lost. CONFIRMATION REQUIRED. Resolves lost_reason_slug against the org taxonomy; returns available_reasons on bad slug.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'inquiry_id'        => ['type' => 'integer'],
                        'lost_reason_slug'  => ['type' => 'string'],
                        'lost_reason_id'    => ['type' => 'integer'],
                        'note'              => ['type' => 'string'],
                    ],
                    'required' => ['inquiry_id'],
                    'additionalProperties' => false,
                ],
            ],
            // ── Ship 6: Leads + Deals voice tools ─────────────────────
            [
                'type' => 'function',
                'name' => 'crm_hot_leads',
                'description' => 'Return inquiries the AI rates as likely to close: ai_win_probability >= threshold (default 60) OR priority=high, created within the window (default 7d). Use this when the user asks "what hot leads do we have" or "anything urgent in the pipeline".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'window_days'           => ['type' => 'integer', 'minimum' => 1, 'maximum' => 90, 'description' => 'How far back to look. Default 7.'],
                        'min_win_probability'   => ['type' => 'integer', 'minimum' => 0, 'maximum' => 100, 'description' => 'Default 60.'],
                        'limit'                 => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30, 'description' => 'Default 15.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_overdue_followups',
                'description' => 'Open inquiries with overdue follow-up tasks OR last_contacted_at older than the threshold. Step 1 of the day-planning playbook.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'cold_days'   => ['type' => 'integer', 'minimum' => 1, 'maximum' => 60, 'description' => 'Days since last contact before counting as overdue. Default 7.'],
                        'limit'       => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'description' => 'Default 25.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_change_stage',
                'description' => 'Move an inquiry between OPEN pipeline stages (kind=open). For mark-won or mark-lost use crm_mark_won / crm_mark_lost. Confirmation NOT required for open-state moves.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'inquiry_id' => ['type' => 'integer'],
                        'stage_slug' => ['type' => 'string', 'description' => 'Target pipeline_stage.slug (must be kind=open).'],
                    ],
                    'required' => ['inquiry_id', 'stage_slug'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_get_inquiry_brief',
                'description' => 'AI-generated brief + intent + win-probability + going-cold risk + suggested action for an inquiry. Cached 15 min on the row. Use BEFORE crm_change_stage / crm_mark_won / crm_mark_lost to confirm the right call.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'inquiry_id' => ['type' => 'integer'],
                        'refresh'    => ['type' => 'boolean', 'description' => 'Force regenerate (skip cache).'],
                    ],
                    'required' => ['inquiry_id'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_create_activity',
                'description' => 'Log a note / call / email / meeting / file on an inquiry. Confirmation NOT required (low blast radius). For type=call/email/meeting also bumps last_contacted_at.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'inquiry_id'        => ['type' => 'integer'],
                        'type'              => ['type' => 'string', 'enum' => ['note', 'call', 'email', 'meeting', 'file']],
                        'subject'           => ['type' => 'string'],
                        'body'              => ['type' => 'string'],
                        'direction'         => ['type' => 'string', 'enum' => ['inbound', 'outbound']],
                        'duration_minutes'  => ['type' => 'integer', 'minimum' => 0, 'maximum' => 1440],
                    ],
                    'required' => ['inquiry_id', 'type'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_create_task',
                'description' => 'Create a follow-up task linked to an inquiry (or unlinked). Defaults assigned_to to the calling user. Confirmation NOT required.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'inquiry_id'    => ['type' => 'integer'],
                        'guest_id'      => ['type' => 'integer'],
                        'title'         => ['type' => 'string'],
                        'description'   => ['type' => 'string'],
                        'type'          => ['type' => 'string', 'enum' => ['call', 'email', 'meeting', 'whatsapp', 'sms', 'video_call', 'send_proposal', 'follow_up', 'site_visit', 'demo', 'contract', 'discovery', 'custom']],
                        'due_at'        => ['type' => 'string', 'description' => 'ISO8601 datetime.'],
                        'assigned_to'   => ['type' => 'integer', 'description' => 'User id. Defaults to the calling user.'],
                    ],
                    'required' => ['title'],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_stuck_deals',
                'description' => 'Open inquiries that have been in their current stage for >= min_days_in_stage without an activity. Useful for "what is stuck" / "anything sitting too long".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'min_days_in_stage' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 365, 'description' => 'Default 14.'],
                        'min_value'         => ['type' => 'number', 'description' => 'Minimum total_value.'],
                        'limit'             => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'description' => 'Default 20.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_pipeline_value_by_stage',
                'description' => 'Aggregate open-inquiry count + total_value grouped by pipeline_stage. With weighted=true multiplies value by the stage default_win_probability.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'pipeline_slug' => ['type' => 'string'],
                        'weighted'      => ['type' => 'boolean'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_pipeline_movement',
                'description' => 'Stage transitions over a period: new leads, won/lost counts + value, top lost-reasons. Use for "how is the pipeline this week" / "what changed".',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'period' => ['type' => 'string', 'enum' => ['today', 'this_week', 'last_week', 'this_month'], 'description' => 'Default this_week.'],
                    ],
                    'additionalProperties' => false,
                ],
            ],
            [
                'type' => 'function',
                'name' => 'crm_find_by_contact',
                'description' => 'Search CRM by guest name / email / phone / company. Returns matching inquiries with their guest + stage. Use when the user mentions a person or company by name.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'query'  => ['type' => 'string'],
                        'limit'  => ['type' => 'integer', 'minimum' => 1, 'maximum' => 25, 'description' => 'Default 10.'],
                    ],
                    'required' => ['query'],
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

    // ─── Leads / Deals voice tools (Ship 6) ─────────────────────────────

    private function tool_crm_hot_leads(array $args, int $orgId, int $userId): array
    {
        $windowDays = max(1, min((int) ($args['window_days'] ?? 7), 90));
        $minWinProb = max(0, min((int) ($args['min_win_probability'] ?? 60), 100));
        $limit      = max(1, min((int) ($args['limit'] ?? 15), 30));
        $since      = now()->subDays($windowDays);

        $rows = Inquiry::query()
            ->with(['guest:id,name,email,phone,company', 'pipelineStage:id,slug,name,kind'])
            ->whereNotIn('status', ['Confirmed', 'Lost'])
            ->where('created_at', '>=', $since)
            ->where(function ($q) use ($minWinProb) {
                $q->where('ai_win_probability', '>=', $minWinProb)
                  ->orWhere('priority', 'High');
            })
            ->orderByDesc('ai_win_probability')
            ->orderByDesc('total_value')
            ->limit($limit)
            ->get();

        return [
            'window_days' => $windowDays,
            'min_win_probability' => $minWinProb,
            'inquiries' => $rows->map(fn (Inquiry $i) => $this->summariseInquiry($i))->all(),
            'total' => $rows->count(),
        ];
    }

    private function tool_crm_overdue_followups(array $args, int $orgId, int $userId): array
    {
        $coldDays = max(1, min((int) ($args['cold_days'] ?? 7), 60));
        $limit    = max(1, min((int) ($args['limit'] ?? 25), 50));
        $threshold = now()->subDays($coldDays);

        $rows = Inquiry::query()
            ->with(['guest:id,name,email,phone,company', 'pipelineStage:id,slug,name,kind'])
            ->whereNotIn('status', ['Confirmed', 'Lost'])
            ->where(function ($q) use ($threshold) {
                $q->where('last_contacted_at', '<', $threshold)
                  ->orWhereNull('last_contacted_at');
            })
            ->orderByRaw('last_contacted_at ASC NULLS FIRST')
            ->limit($limit)
            ->get();

        return [
            'cold_days' => $coldDays,
            'inquiries' => $rows->map(fn (Inquiry $i) => $this->summariseInquiry($i))->all(),
            'total'     => $rows->count(),
        ];
    }

    private function tool_crm_change_stage(array $args, int $orgId, int $userId): array
    {
        $inquiryId = (int) ($args['inquiry_id'] ?? 0);
        $slug      = trim((string) ($args['stage_slug'] ?? ''));
        if ($inquiryId <= 0 || $slug === '') {
            return ['error' => 'inquiry_id and stage_slug are required.'];
        }

        $inquiry = Inquiry::find($inquiryId);
        if (!$inquiry) {
            return ['error' => 'Inquiry not found.', 'inquiry_id' => $inquiryId];
        }

        $stage = \App\Models\PipelineStage::query()
            ->where('pipeline_id', $inquiry->pipeline_id)
            ->where('slug', $slug)
            ->first();

        if (!$stage) {
            $available = \App\Models\PipelineStage::query()
                ->where('pipeline_id', $inquiry->pipeline_id)
                ->get(['slug', 'name', 'kind'])
                ->all();
            return [
                'error' => "Unknown stage slug '{$slug}' for this inquiry's pipeline.",
                'available_stages' => $available,
            ];
        }

        if (in_array(strtolower((string) $stage->kind), ['won', 'lost'], true)) {
            return [
                'error' => "This tool only moves between OPEN stages. Use crm_mark_won / crm_mark_lost for terminal transitions.",
                'target_kind' => $stage->kind,
            ];
        }

        $inquiry->forceFill(['pipeline_stage_id' => $stage->id])->save();

        \App\Models\Activity::create([
            'organization_id'    => $inquiry->organization_id,
            'brand_id'           => $inquiry->brand_id,
            'inquiry_id'         => $inquiry->id,
            'guest_id'           => $inquiry->guest_id,
            'corporate_account_id' => $inquiry->corporate_account_id,
            'type'               => 'status_change',
            'subject'            => "Moved to {$stage->name}",
            'metadata'           => ['to_slug' => $stage->slug, 'via' => 'voice_agent'],
            'created_by'         => $userId,
            'occurred_at'        => now(),
        ]);

        return [
            'ok' => true,
            'inquiry_id' => $inquiry->id,
            'stage' => [
                'slug' => $stage->slug,
                'name' => $stage->name,
                'kind' => $stage->kind,
            ],
        ];
    }

    private function tool_crm_get_inquiry_brief(array $args, int $orgId, int $userId): array
    {
        $inquiryId = (int) ($args['inquiry_id'] ?? 0);
        if ($inquiryId <= 0) return ['error' => 'inquiry_id is required.'];

        $req = new \Illuminate\Http\Request($this->stringifyArgs([
            'refresh' => !empty($args['refresh']) ? '1' : null,
        ]));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\InquiryController::class);
        return $controller->aiBrief($req, $inquiryId)->getData(true);
    }

    private function tool_crm_create_activity(array $args, int $orgId, int $userId): array
    {
        $inquiryId = (int) ($args['inquiry_id'] ?? 0);
        if ($inquiryId <= 0) return ['error' => 'inquiry_id is required.'];

        $inquiry = Inquiry::find($inquiryId);
        if (!$inquiry) return ['error' => 'Inquiry not found.', 'inquiry_id' => $inquiryId];

        $payload = [];
        foreach (['type', 'subject', 'body', 'direction'] as $k) {
            if (isset($args[$k])) $payload[$k] = (string) $args[$k];
        }
        if (isset($args['duration_minutes'])) {
            $payload['duration_minutes'] = (int) $args['duration_minutes'];
        }

        $req = new \Illuminate\Http\Request($payload);
        $req->setUserResolver(fn () => \App\Models\User::find($userId));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\ActivityController::class);
        return $controller->store($inquiry, $req)->getData(true);
    }

    private function tool_crm_create_task(array $args, int $orgId, int $userId): array
    {
        $payload = [];
        foreach (['inquiry_id', 'guest_id', 'assigned_to'] as $k) {
            if (isset($args[$k])) $payload[$k] = (int) $args[$k];
        }
        foreach (['title', 'description', 'type', 'due_at'] as $k) {
            if (isset($args[$k])) $payload[$k] = (string) $args[$k];
        }

        $req = new \Illuminate\Http\Request($payload);
        $req->setUserResolver(fn () => \App\Models\User::find($userId));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\TaskController::class);
        return $controller->store($req)->getData(true);
    }

    private function tool_crm_stuck_deals(array $args, int $orgId, int $userId): array
    {
        $minDays = max(1, min((int) ($args['min_days_in_stage'] ?? 14), 365));
        $minValue = isset($args['min_value']) ? (float) $args['min_value'] : 0.0;
        $limit   = max(1, min((int) ($args['limit'] ?? 20), 50));
        $threshold = now()->subDays($minDays);

        $rows = Inquiry::query()
            ->with(['guest:id,name,email,phone,company', 'pipelineStage:id,slug,name,kind'])
            ->whereNotIn('status', ['Confirmed', 'Lost'])
            ->where('updated_at', '<', $threshold)
            ->when($minValue > 0, fn ($q) => $q->where('total_value', '>=', $minValue))
            ->orderBy('updated_at')
            ->limit($limit)
            ->get();

        $deals = $rows->map(function (Inquiry $i) {
            $base = $this->summariseInquiry($i);
            $base['days_in_stage'] = $i->updated_at ? (int) $i->updated_at->diffInDays(now()) : null;
            return $base;
        })->all();

        return [
            'min_days_in_stage' => $minDays,
            'deals' => $deals,
            'total' => count($deals),
            'total_value_at_risk' => round(array_sum(array_map(fn ($d) => (float) ($d['total_value'] ?? 0), $deals)), 2),
        ];
    }

    private function tool_crm_pipeline_value_by_stage(array $args, int $orgId, int $userId): array
    {
        $pipelineSlug = $args['pipeline_slug'] ?? null;
        $weighted = (bool) ($args['weighted'] ?? false);

        $pipeline = $pipelineSlug
            ? \App\Models\Pipeline::where('slug', $pipelineSlug)->first()
            : \App\Models\Pipeline::where('is_default', true)->first();

        if (!$pipeline) {
            return ['error' => $pipelineSlug ? "No pipeline with slug '{$pipelineSlug}'." : 'No default pipeline configured.'];
        }

        $stages = \App\Models\PipelineStage::query()
            ->where('pipeline_id', $pipeline->id)
            ->orderBy('sort_order')
            ->get();

        $totals = ['count' => 0, 'value' => 0.0, 'weighted' => 0.0];
        $rows = $stages->map(function ($stage) use (&$totals) {
            $base = Inquiry::query()
                ->where('pipeline_stage_id', $stage->id)
                ->whereNotIn('status', ['Confirmed', 'Lost']);
            $count = (int) (clone $base)->count();
            $value = (float) (clone $base)->sum('total_value');
            $prob = (int) ($stage->default_win_probability ?? 0);
            $weighted = round($value * ($prob / 100), 2);
            $totals['count'] += $count;
            $totals['value'] += $value;
            $totals['weighted'] += $weighted;
            return [
                'slug' => $stage->slug,
                'name' => $stage->name,
                'kind' => $stage->kind,
                'count' => $count,
                'total_value' => round($value, 2),
                'weighted_value' => $weighted,
                'default_win_probability' => $prob,
            ];
        })->all();

        return [
            'pipeline' => ['id' => $pipeline->id, 'slug' => $pipeline->slug, 'name' => $pipeline->name],
            'weighted_requested' => $weighted,
            'stages' => $rows,
            'totals' => [
                'open_count' => $totals['count'],
                'open_value' => round($totals['value'], 2),
                'weighted_value' => round($totals['weighted'], 2),
            ],
        ];
    }

    private function tool_crm_pipeline_movement(array $args, int $orgId, int $userId): array
    {
        $period = (string) ($args['period'] ?? 'this_week');
        [$from, $to] = match ($period) {
            'today'      => [now()->startOfDay(),       now()],
            'last_week'  => [now()->subWeek()->startOfWeek(), now()->subWeek()->endOfWeek()],
            'this_month' => [now()->startOfMonth(),     now()],
            default      => [now()->startOfWeek(),      now()],
        };

        $newLeads = (int) Inquiry::whereBetween('created_at', [$from, $to])->count();
        $won = Inquiry::where('status', 'Confirmed')->whereBetween('updated_at', [$from, $to]);
        $lost = Inquiry::where('status', 'Lost')->whereBetween('updated_at', [$from, $to]);

        $wonCount = (int) (clone $won)->count();
        $wonValue = round((float) (clone $won)->sum('total_value'), 2);
        $lostCount = (int) (clone $lost)->count();
        $lostValue = round((float) (clone $lost)->sum('total_value'), 2);

        $topLost = \DB::table('activities')
            ->whereBetween('created_at', [$from, $to])
            ->where('type', 'status_change')
            ->whereJsonContains('metadata->kind', 'lost')
            ->selectRaw("metadata->>'lost_reason_label' as label, COUNT(*) as count")
            ->groupBy('label')
            ->orderByDesc('count')
            ->limit(5)
            ->get()
            ->map(fn ($r) => ['label' => $r->label ?? 'unspecified', 'count' => (int) $r->count])
            ->all();

        return [
            'period'     => $period,
            'from'       => $from->toIso8601String(),
            'to'         => $to->toIso8601String(),
            'new_leads'  => $newLeads,
            'won_count'  => $wonCount,
            'won_value'  => $wonValue,
            'lost_count' => $lostCount,
            'lost_value' => $lostValue,
            'net_pipeline_delta_value' => round($wonValue - $lostValue, 2),
            'top_lost_reasons' => $topLost,
        ];
    }

    private function tool_crm_find_by_contact(array $args, int $orgId, int $userId): array
    {
        $query = trim((string) ($args['query'] ?? ''));
        if ($query === '') return ['error' => 'query is required.'];
        $limit = max(1, min((int) ($args['limit'] ?? 10), 25));
        $term = '%' . $query . '%';

        $rows = Inquiry::query()
            ->with(['guest:id,name,email,phone,company', 'pipelineStage:id,slug,name,kind'])
            ->where(function ($q) use ($term) {
                $q->whereHas('guest', function ($g) use ($term) {
                    $g->where('name', 'ilike', $term)
                      ->orWhere('email', 'ilike', $term)
                      ->orWhere('phone', 'ilike', $term)
                      ->orWhere('company', 'ilike', $term);
                });
            })
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        return [
            'query' => $query,
            'matches' => $rows->map(fn (Inquiry $i) => $this->summariseInquiry($i))->all(),
            'total' => $rows->count(),
        ];
    }

    // ─── Engagement / chat voice tools (Ship 8) ─────────────────────

    private function tool_engagement_hot_leads(array $args, int $orgId, int $userId): array
    {
        $range = (string) ($args['range'] ?? 'today');
        $limit = max(1, min((int) ($args['limit'] ?? 15), 30));
        $feed = app(EngagementFeedService::class);
        $paginator = $feed->feed($orgId, [
            'filter'   => 'hot_lead',
            'range'    => $range,
            'per_page' => $limit,
        ]);

        $rows = collect($paginator->items())->map(fn ($r) => $this->compactEngagementRow($r))->all();
        return ['range' => $range, 'leads' => $rows, 'total' => $paginator->total()];
    }

    private function tool_engagement_waiting_human(array $args, int $orgId, int $userId): array
    {
        $minWait = max(0, (int) ($args['min_wait_minutes'] ?? 0));
        $limit   = max(1, min((int) ($args['limit'] ?? 15), 30));
        $feed = app(EngagementFeedService::class);

        $paginator = $feed->feed($orgId, [
            'filter'   => 'unanswered',
            'range'    => 'today',
            'per_page' => $limit * 2, // over-fetch so we can post-filter by wait
        ]);

        $threshold = $minWait > 0 ? now()->subMinutes($minWait) : null;
        $rows = collect($paginator->items())
            ->filter(function ($r) use ($threshold) {
                if (!$threshold) return true;
                $last = $r['last_message_at'] ?? null;
                if (!$last) return false;
                try {
                    return \Carbon\Carbon::parse($last)->lessThanOrEqualTo($threshold);
                } catch (\Throwable) {
                    return true;
                }
            })
            ->take($limit)
            ->map(fn ($r) => $this->compactEngagementRow($r))
            ->all();

        return [
            'min_wait_minutes' => $minWait,
            'conversations'    => $rows,
            'total'            => count($rows),
        ];
    }

    private function tool_engagement_conversation_brief(array $args, int $orgId, int $userId): array
    {
        $convId  = (int) ($args['conversation_id'] ?? 0);
        $refresh = (bool) ($args['refresh'] ?? false);
        if ($convId <= 0) return ['error' => 'conversation_id is required.'];

        $conv = \App\Models\ChatConversation::withoutGlobalScopes()
            ->where('id', $convId)
            ->where('organization_id', $orgId)
            ->first();
        if (!$conv) return ['error' => 'Conversation not found.', 'conversation_id' => $convId];

        $svc = app(\App\Services\EngagementAiService::class);
        return $svc->briefForConversation($conv, $refresh);
    }

    private function tool_engagement_summarize_today(array $args, int $orgId, int $userId): array
    {
        $feed = app(EngagementFeedService::class);
        $kpis = $feed->kpis($orgId);

        // Per-channel breakdown for today
        $today = now()->startOfDay();
        $channelCounts = \App\Models\ChatConversation::query()
            ->where('organization_id', $orgId)
            ->where('last_message_at', '>=', $today)
            ->selectRaw('COALESCE(channel, ?) as channel, COUNT(*) as cnt', ['widget'])
            ->groupBy('channel')
            ->get()
            ->mapWithKeys(fn ($r) => [$r->channel => (int) $r->cnt])
            ->toArray();

        // Top 5 unanswered by wait
        $waiting = $feed->feed($orgId, [
            'filter' => 'unanswered',
            'range'  => 'today',
            'per_page' => 5,
        ]);

        return [
            'date' => now()->toDateString(),
            'kpis' => $kpis,
            'by_channel_today' => $channelCounts,
            'top_unanswered'   => collect($waiting->items())->map(fn ($r) => $this->compactEngagementRow($r))->all(),
        ];
    }

    private function tool_engagement_list_channel(array $args, int $orgId, int $userId): array
    {
        $channel = strtolower((string) ($args['channel'] ?? 'widget'));
        $limit   = max(1, min((int) ($args['limit'] ?? 15), 30));

        $rows = \App\Models\ChatConversation::query()
            ->where('organization_id', $orgId)
            ->where('channel', $channel)
            ->with([
                'visitor:id,display_name,email,phone,country,is_lead,last_seen_at',
                'channelAccount:id,channel,display_name,external_id,status',
            ])
            ->orderByDesc('last_message_at')
            ->limit($limit)
            ->get();

        return [
            'channel' => $channel,
            'conversations' => $rows->map(fn ($c) => [
                'id'              => $c->id,
                'visitor_name'    => $c->visitor?->display_name ?? $c->visitor_name,
                'visitor_email'   => $c->visitor?->email,
                'visitor_phone'   => $c->visitor?->phone,
                'intent_tag'      => $c->intent_tag,
                'messages_count'  => (int) $c->messages_count,
                'lead_captured'   => (bool) $c->lead_captured,
                'ai_enabled'      => (bool) $c->ai_enabled,
                'status'          => $c->status,
                'channel_account' => $c->channelAccount ? [
                    'display_name' => $c->channelAccount->display_name,
                    'external_id'  => $c->channelAccount->external_id,
                    'status'       => $c->channelAccount->status,
                ] : null,
                'last_message_at' => $c->last_message_at?->toIso8601String(),
            ])->all(),
            'total' => $rows->count(),
        ];
    }

    private function tool_engagement_channel_health(array $args, int $orgId, int $userId): array
    {
        $channelFilter = $args['channel'] ?? null;

        $query = \App\Models\ChatChannelAccount::query()
            ->where('organization_id', $orgId);
        if ($channelFilter) {
            $query->where('channel', strtolower((string) $channelFilter));
        }

        $rows = $query->orderBy('channel')->orderBy('display_name')->get();

        return [
            'accounts' => $rows->map(fn ($a) => [
                'id'              => $a->id,
                'channel'         => $a->channel,
                'display_name'    => $a->display_name,
                'external_id'     => $a->external_id,
                'status'          => $a->status,
                'last_webhook_at' => $a->last_webhook_at?->toIso8601String(),
                'last_error'      => $a->last_error,
                'token_expires_at' => $a->token_expires_at?->toIso8601String(),
                'data_access_expires_at' => $a->data_access_expires_at?->toIso8601String(),
            ])->all(),
            'total'    => $rows->count(),
            'reauth_required_count' => (int) $rows->where('status', \App\Models\ChatChannelAccount::STATUS_REAUTH)->count(),
        ];
    }

    /**
     * Reduce an EngagementFeedService row down to the fields voice
     * actually needs. Keeps payload tight so the model can verbalise
     * without re-summarising.
     */
    private function compactEngagementRow(array $r): array
    {
        return [
            'visitor_id'           => $r['visitor_id'] ?? ($r['id'] ?? null),
            'conversation_id'      => $r['conversation_id'] ?? null,
            'display_name'         => $r['display_name'] ?? null,
            'email'                => $r['email'] ?? null,
            'phone'                => $r['phone'] ?? null,
            'country'              => $r['country'] ?? null,
            'is_online'            => (bool) ($r['is_online'] ?? false),
            'is_hot_lead'          => (bool) ($r['is_hot_lead'] ?? false),
            'intent_tag'           => $r['intent_tag'] ?? null,
            'channel'              => $r['channel'] ?? 'widget',
            'last_message_preview' => $r['last_message_preview'] ?? null,
            'last_message_at'      => $r['last_message_at'] ?? null,
            'unread_count'         => (int) ($r['unread_count'] ?? 0),
            'priority_score'       => (int) ($r['priority_score'] ?? 0),
        ];
    }

    // ─── Mutation tools (Ship 7) ────────────────────────────────────
    //
    // Reach these ONLY after the user has verbally confirmed and
    // the frontend ConfirmActionModal has been approved. Even so,
    // we re-validate every input server-side because a compromised
    // browser could call /voice-tool with arbitrary args.

    private function tool_award_points(array $args, int $orgId, int $userId): array
    {
        $memberId = (int) ($args['member_id'] ?? 0);
        $points   = (int) ($args['points'] ?? 0);
        $desc     = trim((string) ($args['description'] ?? ''));

        if ($memberId <= 0 || $points <= 0 || $desc === '') {
            return ['error' => 'member_id, points, description are required and must be positive.'];
        }
        if ($points > 1000000) {
            return ['error' => 'Refusing to award more than 1,000,000 points in a single call. Split into multiple awards if intentional.'];
        }

        $member = LoyaltyMember::find($memberId);
        if (!$member) return ['error' => 'Member not found.', 'member_id' => $memberId];

        $staff = \App\Models\User::find($userId);

        try {
            $tx = app(\App\Services\LoyaltyService::class)->awardPoints(
                member: $member,
                points: $points,
                description: $desc,
                type: 'earn',
                staff: $staff,
                reasonCode: 'voice_agent',
                sourceType: 'voice_agent',
                idempotencyKey: 'voice-award-' . $userId . '-' . $memberId . '-' . microtime(true),
            );
        } catch (\Throwable $e) {
            return ['error' => 'Award failed: ' . $e->getMessage()];
        }

        $member->refresh();
        return [
            'ok' => true,
            'transaction_id' => $tx->id,
            'member_id'      => $member->id,
            'member_name'    => $member->user?->name,
            'points_awarded' => $points,
            'new_balance'    => (int) $member->current_points,
            'description'    => $desc,
        ];
    }

    private function tool_redeem_points(array $args, int $orgId, int $userId): array
    {
        $memberId = (int) ($args['member_id'] ?? 0);
        $points   = (int) ($args['points'] ?? 0);
        $desc     = trim((string) ($args['description'] ?? ''));

        if ($memberId <= 0 || $points <= 0 || $desc === '') {
            return ['error' => 'member_id, points, description are required and must be positive.'];
        }

        $member = LoyaltyMember::find($memberId);
        if (!$member) return ['error' => 'Member not found.', 'member_id' => $memberId];

        if ($points > (int) $member->current_points) {
            return [
                'error' => 'Insufficient balance.',
                'member_id' => $member->id,
                'requested' => $points,
                'available' => (int) $member->current_points,
            ];
        }

        $staff = \App\Models\User::find($userId);

        try {
            $tx = app(\App\Services\LoyaltyService::class)->redeemPoints(
                member: $member,
                points: $points,
                description: $desc,
                staff: $staff,
                reasonCode: 'voice_agent',
                sourceType: 'voice_agent',
                idempotencyKey: 'voice-redeem-' . $userId . '-' . $memberId . '-' . microtime(true),
            );
        } catch (\Throwable $e) {
            return ['error' => 'Redeem failed: ' . $e->getMessage()];
        }

        $member->refresh();
        return [
            'ok' => true,
            'transaction_id' => $tx->id,
            'member_id'      => $member->id,
            'member_name'    => $member->user?->name,
            'points_redeemed' => $points,
            'new_balance'    => (int) $member->current_points,
            'description'    => $desc,
        ];
    }

    private function tool_crm_mark_won(array $args, int $orgId, int $userId): array
    {
        $inquiryId = (int) ($args['inquiry_id'] ?? 0);
        if ($inquiryId <= 0) return ['error' => 'inquiry_id is required.'];

        $payload = [];
        if (isset($args['note'])) $payload['note'] = (string) $args['note'];

        $req = new \Illuminate\Http\Request($payload);
        $req->setUserResolver(fn () => \App\Models\User::find($userId));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\InquiryController::class);
        return $controller->markWon($req, $inquiryId)->getData(true);
    }

    private function tool_crm_mark_lost(array $args, int $orgId, int $userId): array
    {
        $inquiryId = (int) ($args['inquiry_id'] ?? 0);
        if ($inquiryId <= 0) return ['error' => 'inquiry_id is required.'];

        $payload = [];
        if (isset($args['note'])) $payload['note'] = (string) $args['note'];

        // Resolve slug → id if the model used the friendlier slug form.
        if (!isset($args['lost_reason_id']) && !empty($args['lost_reason_slug'])) {
            $slug = trim((string) $args['lost_reason_slug']);
            $reason = \App\Models\InquiryLostReason::where('slug', $slug)
                ->where('is_active', true)
                ->first();
            if (!$reason) {
                $available = \App\Models\InquiryLostReason::where('is_active', true)
                    ->orderBy('sort_order')
                    ->get(['id', 'slug', 'label'])
                    ->all();
                return [
                    'error' => "Unknown lost_reason_slug '{$slug}'.",
                    'available_reasons' => $available,
                ];
            }
            $payload['lost_reason_id'] = $reason->id;
        } elseif (!empty($args['lost_reason_id'])) {
            $payload['lost_reason_id'] = (int) $args['lost_reason_id'];
        } else {
            $available = \App\Models\InquiryLostReason::where('is_active', true)
                ->orderBy('sort_order')
                ->get(['id', 'slug', 'label'])
                ->all();
            return [
                'error' => 'lost_reason_slug or lost_reason_id required.',
                'available_reasons' => $available,
            ];
        }

        $req = new \Illuminate\Http\Request($payload);
        $req->setUserResolver(fn () => \App\Models\User::find($userId));
        $controller = app(\App\Http\Controllers\Api\V1\Admin\InquiryController::class);
        return $controller->markLost($req, $inquiryId)->getData(true);
    }

    /**
     * Compact inquiry summary used across the leads/deals tools. Keeps
     * payload shape identical so the model can format any of these
     * results without branching on which tool produced them.
     */
    private function summariseInquiry(Inquiry $i): array
    {
        return [
            'id'                  => $i->id,
            'subject'             => $i->subject,
            'status'              => $i->status,
            'priority'            => $i->priority,
            'total_value'         => $i->total_value,
            'stage'               => $i->pipelineStage ? [
                'slug' => $i->pipelineStage->slug,
                'name' => $i->pipelineStage->name,
                'kind' => $i->pipelineStage->kind,
            ] : null,
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
        ];
    }
}
