<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\AuditLog;
use App\Models\Inquiry;
use App\Models\InquiryAttachment;
use App\Models\InquiryLostReason;
use App\Models\CustomField;
use App\Models\PipelineStage;
use App\Models\Reservation;
use App\Models\Task;
use App\Services\CustomFieldService;
use App\Services\InquiryAiService;
use App\Services\RealtimeEventService;
use App\Services\XlsxWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InquiryController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
        protected InquiryAiService $ai,
        protected CustomFieldService $customFields,
    ) {}
    public function index(Request $request): JsonResponse
    {
        // CRM Phase 6 polish: include pipelineStage on list rows so the
        // status pill in the table can color itself from the actual
        // stage's `color` field instead of the hardcoded STATUS_COLORS
        // map. Falls back to the legacy mapping when no stage is bound
        // (legacy or imported rows).
        // Guest needs email + phone + mobile in the list so the row's
        // Email / WhatsApp / Call pill buttons can light up. Without
        // these fields, chat-captured leads (which DO populate phone
        // via the widget capture flow) silently appear contactless.
        $query = Inquiry::with([
            'guest:id,full_name,company,email,phone,mobile,vip_level,nationality,country',
            'property:id,name,code',
            'corporateAccount:id,company_name',
            'pipelineStage:id,name,color,kind',
        ]);

        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('event_name', 'ilike', "%$s%")
                  ->orWhere('room_type_requested', 'ilike', "%$s%")
                  ->orWhereHas('guest', fn($q2) => $q2->where('full_name', 'ilike', "%$s%")->orWhere('company', 'ilike', "%$s%"));
            });
        }
        if ($v = $request->get('status'))        $query->where('status', $v);
        if ($v = $request->get('priority'))      $query->where('priority', $v);
        if ($v = $request->get('inquiry_type'))  $query->where('inquiry_type', $v);
        if ($v = $request->get('property_id'))   $query->where('property_id', $v);
        if ($v = $request->get('assigned_to'))   $query->where('assigned_to', $v);
        if ($v = $request->get('source'))        $query->where('source', $v);
        if ($v = $request->get('date_from'))     $query->where('created_at', '>=', $v);
        if ($v = $request->get('date_to'))       $query->where('created_at', '<=', $v . ' 23:59:59');
        if ($v = $request->get('check_in_from')) $query->where('check_in', '>=', $v);
        if ($v = $request->get('check_in_to'))   $query->where('check_in', '<=', $v);
        if ($request->get('active_only'))        $query->whereNotIn('status', ['Confirmed', 'Lost']);
        if ($v = $request->get('task_due')) {
            match ($v) {
                'today'   => $query->where('next_task_due', now()->toDateString())->where('next_task_completed', false),
                'overdue' => $query->where('next_task_due', '<', now()->toDateString())->where('next_task_completed', false),
                'soon'    => $query->whereBetween('next_task_due', [now()->toDateString(), now()->addDays(3)->toDateString()])->where('next_task_completed', false),
                default   => null,
            };
        }

        // Whitelist sort + dir — Eloquent's orderBy() does NOT parameter-bind
        // the column name. See AUDIT-2026-06-13.md high security finding.
        $allowedSorts = ['created_at','updated_at','guest_name','check_in','check_out','status','priority','value_estimated','win_probability','next_task_due','assigned_to'];
        $sort = in_array($request->get('sort'), $allowedSorts, true) ? $request->get('sort') : 'created_at';
        $dir  = $request->get('dir') === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sort, $dir);

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'guest_id'             => 'required|integer|exists:guests,id',
            'corporate_account_id' => 'nullable|integer|exists:corporate_accounts,id',
            'property_id'          => 'nullable|integer|exists:properties,id',
            'inquiry_type'         => 'nullable|string|max:50',
            'source'               => 'nullable|string|max:100',
            'check_in'             => 'nullable|date',
            'check_out'            => 'nullable|date|after_or_equal:check_in',
            'num_rooms'            => 'nullable|integer|min:1',
            'num_adults'           => 'nullable|integer|min:1',
            'num_children'         => 'nullable|integer|min:0',
            'room_type_requested'  => 'nullable|string|max:100',
            'rate_offered'         => 'nullable|numeric|min:0',
            'total_value'          => 'nullable|numeric|min:0',
            'status'               => 'nullable|string|max:50',
            'priority'             => 'nullable|string|max:20',
            'assigned_to'          => 'nullable|string|max:150',
            'special_requests'     => 'nullable|string',
            'event_type'           => 'nullable|string|max:100',
            'event_name'           => 'nullable|string|max:200',
            'event_pax'            => 'nullable|integer|min:1',
            'function_space'       => 'nullable|string|max:100',
            'catering_required'    => 'nullable|boolean',
            'av_required'          => 'nullable|boolean',
            'next_task_type'       => 'nullable|string|max:50',
            'next_task_due'        => 'nullable|date',
            'next_task_notes'      => 'nullable|string',
            'notes'                => 'nullable|string',
            'custom_data'          => 'nullable|array',
        ]);

        if (!empty($v['check_in']) && !empty($v['check_out'])) {
            $v['num_nights'] = (int) date_diff(date_create($v['check_in']), date_create($v['check_out']))->days;
        }

        // CRM Phase 7 — sanitize custom fields against the active schema.
        $v['custom_data'] = $this->customFields->validate('inquiry', $v['custom_data'] ?? null);

        $inquiry = Inquiry::create($v);
        $inquiry->load(['guest:id,full_name', 'property:id,name,code']);

        $this->realtime->dispatch('inquiry', 'New Inquiry',
            ($inquiry->inquiry_type ?? 'Inquiry') . ' from ' . ($inquiry->guest?->full_name ?? 'Unknown'),
            ['id' => $inquiry->id, 'type' => $inquiry->inquiry_type, 'guest' => $inquiry->guest?->full_name, 'value' => $inquiry->total_value]
        );

        return response()->json($inquiry, 201);
    }

    public function show(Inquiry $inquiry): JsonResponse
    {
        // CRM Phase 1: extra eager loads for the full lead-detail page
        // (pipeline + stage + lost-reason for the header chip + status
        // dropdown, activities/openTasks for the timeline + sidebar).
        // The legacy minimal payload still works because we're only
        // adding nested data, not reshaping the top-level response.
        $inquiry->load([
            'guest',
            'property',
            'corporateAccount',
            'reservations'  => fn($q) => $q->latest(),
            // Phase 1 — eager-load the whole pipeline + its stages in one
            // go so the lead-detail page can render the stage dropdown
            // without a second roundtrip. Stage list is small (≤ ~10 rows
            // per pipeline) so the over-fetch is cheaper than the extra
            // request.
            'pipeline:id,name',
            'pipeline.stages:id,pipeline_id,name,slug,color,kind,sort_order,default_win_probability',
            'pipelineStage:id,pipeline_id,name,slug,color,kind,sort_order,default_win_probability',
            'lostReason:id,label',
            'activities' => fn($q) => $q
                ->with('creator:id,name,email')
                ->latest('occurred_at')
                ->limit(50),
            'openTasks'  => fn($q) => $q->with('assignee:id,name'),
        ]);
        return response()->json($inquiry);
    }

    /**
     * GET /v1/admin/inquiries/{id}/chat-history
     *
     * Returns every chat conversation linked to this inquiry's guest, with
     * messages inline, sorted most-recent-conversation first. Linkage path:
     *   inquiry.guest_id -> guest -> visitors.guest_id -> chat_conversations.visitor_id
     *
     * Lets staff read the full prior conversation right inside the lead-
     * detail page instead of bouncing to the Engagement Hub. User-reported:
     * 'as we have a lot of customers in leads from AI chatbot, can we see
     * chat communication directly in leads section' (2026-06-12).
     */
    public function chatHistory(int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);

        // Org-scoped because TenantScope is fail-closed.
        if (!$inquiry->guest_id) {
            return response()->json(['conversations' => [], 'message' => 'Inquiry has no linked guest.']);
        }

        // Find every visitor row that has been merged into this guest.
        // Most chatbot-captured leads have exactly one; a returning visitor
        // who chatted on two different devices could have two.
        $visitorIds = \App\Models\Visitor::withoutGlobalScopes()
            ->where('organization_id', $inquiry->organization_id)
            ->where('guest_id', $inquiry->guest_id)
            ->pluck('id');

        if ($visitorIds->isEmpty()) {
            return response()->json(['conversations' => []]);
        }

        // Load every conversation belonging to those visitors, with a
        // reasonable cap on messages so a 500-message ramble doesn't
        // bloat the response. Order by most-recent activity desc so
        // the latest conversation is at the top.
        $conversations = \App\Models\ChatConversation::withoutGlobalScopes()
            ->where('organization_id', $inquiry->organization_id)
            ->whereIn('visitor_id', $visitorIds)
            ->with([
                'assignedAgent:id,name,email',
                'visitor:id,country,city,visit_count,referrer,is_lead',
            ])
            ->orderByDesc('last_message_at')
            ->limit(20)
            ->get();

        // Attach messages inline — newest 100 per conversation. Keeps the
        // single round-trip lightweight; longer threads link out to the
        // Engagement Hub for the full feed.
        $conversationIds = $conversations->pluck('id');
        $messagesByConv = \App\Models\ChatMessage::withoutGlobalScopes()
            ->whereIn('conversation_id', $conversationIds)
            ->orderBy('created_at')
            ->get(['id', 'conversation_id', 'sender_type', 'sender_user_id', 'content', 'created_at'])
            ->groupBy('conversation_id');

        $conversations->each(function ($conv) use ($messagesByConv) {
            $conv->setAttribute('messages', $messagesByConv->get($conv->id, collect()));
        });

        return response()->json(['conversations' => $conversations]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        // Explicit binding + BrandScope opt-out. Implicit binding has
        // repeatedly produced prod-only 404s on this codebase (lead-forms
        // Phase 10, planner v2.1) — the inquiry's brand_id can be null
        // or differ from the SPA's current brand selector, which a stale
        // route cache turns into a 404 even with resolveRouteBinding.
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);

        $v = $request->validate([
            'corporate_account_id' => 'nullable|integer|exists:corporate_accounts,id',
            'property_id'          => 'nullable|integer|exists:properties,id',
            'inquiry_type'         => 'nullable|string|max:50',
            'source'               => 'nullable|string|max:100',
            'check_in'             => 'nullable|date',
            'check_out'            => 'nullable|date',
            'num_rooms'            => 'nullable|integer|min:1',
            'num_adults'           => 'nullable|integer|min:1',
            'num_children'         => 'nullable|integer|min:0',
            'room_type_requested'  => 'nullable|string|max:100',
            'rate_offered'         => 'nullable|numeric|min:0',
            'total_value'          => 'nullable|numeric|min:0',
            'status'               => 'nullable|string|max:50',
            'priority'             => 'nullable|string|max:20',
            'assigned_to'          => 'nullable|string|max:150',
            'special_requests'     => 'nullable|string',
            'event_type'           => 'nullable|string|max:100',
            'event_name'           => 'nullable|string|max:200',
            'event_pax'            => 'nullable|integer|min:1',
            'function_space'       => 'nullable|string|max:100',
            'catering_required'    => 'nullable|boolean',
            'av_required'          => 'nullable|boolean',
            'next_task_type'       => 'nullable|string|max:50',
            'next_task_due'        => 'nullable|date',
            'next_task_notes'      => 'nullable|string',
            'next_task_completed'  => 'nullable|boolean',
            'notes'                => 'nullable|string',
            'custom_data'          => 'nullable|array',
        ]);

        $checkIn  = $v['check_in'] ?? $inquiry->check_in?->toDateString();
        $checkOut = $v['check_out'] ?? $inquiry->check_out?->toDateString();
        if ($checkIn && $checkOut) {
            $v['num_nights'] = (int) date_diff(date_create($checkIn), date_create($checkOut))->days;
        }

        if (array_key_exists('custom_data', $v)) {
            $v['custom_data'] = $this->customFields->validate('inquiry', $v['custom_data']);
        }

        $inquiry->update($v);

        // Keep pipeline_stage_id in lockstep with the status the UI writes.
        // The leads list + kanban + detail all set `status` to the chosen
        // stage's NAME; without this resync, the stage pill + colour (which
        // read `pipeline_stage`) show the OLD stage while the dropdown shows
        // the new one — the "status changes but the card doesn't" bug.
        // Resolve the stage by name within the inquiry's pipeline, falling
        // back to the won/lost stage by kind for the terminal statuses.
        $syncedStage = null;
        if (array_key_exists('status', $v) && $v['status'] !== null && $inquiry->pipeline_id) {
            $stage = PipelineStage::where('pipeline_id', $inquiry->pipeline_id)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($v['status']))])
                ->first();
            if (!$stage) {
                $kind = $v['status'] === 'Confirmed' ? 'won' : ($v['status'] === 'Lost' ? 'lost' : null);
                if ($kind) {
                    $stage = PipelineStage::where('pipeline_id', $inquiry->pipeline_id)
                        ->where('kind', $kind)->orderBy('sort_order')->first();
                }
            }
            if ($stage && $stage->id !== $inquiry->pipeline_stage_id) {
                $inquiry->pipeline_stage_id = $stage->id;
                $inquiry->save();
            }
            $syncedStage = $stage;
        }

        // Auto-create reservation when the deal is won. Keyed on the resolved
        // stage's `kind` (not just the literal "Confirmed") so orgs that
        // renamed their won stage — or any non-hotel preset whose won stage
        // is "Completed"/"Enrolled"/etc. — still spawn the reservation when
        // the inline stage dropdown writes that stage's name. The property_id
        // guard keeps non-hotel inquiries (no property) out of this path.
        $isWon = ($v['status'] ?? null) === 'Confirmed' || (($syncedStage->kind ?? null) === 'won');
        if ($isWon && !$inquiry->reservations()->exists() && $inquiry->property_id) {
            $confNo = strtoupper($inquiry->property->code ?? 'HTL') . '-' . str_pad($inquiry->id, 5, '0', STR_PAD_LEFT);
            Reservation::create([
                'guest_id'             => $inquiry->guest_id,
                'inquiry_id'           => $inquiry->id,
                'corporate_account_id' => $inquiry->corporate_account_id,
                'property_id'          => $inquiry->property_id,
                'confirmation_no'      => $confNo,
                'check_in'             => $inquiry->check_in,
                'check_out'            => $inquiry->check_out,
                'num_nights'           => $inquiry->num_nights,
                'num_rooms'            => $inquiry->num_rooms,
                'num_adults'           => $inquiry->num_adults,
                'num_children'         => $inquiry->num_children,
                'room_type'            => $inquiry->room_type_requested,
                'rate_per_night'       => $inquiry->rate_offered,
                'total_amount'         => $inquiry->total_value,
                'source'               => $inquiry->source,
                'special_requests'     => $inquiry->special_requests,
                'status'               => 'Confirmed',
            ]);
        }

        return response()->json($inquiry->fresh()->load([
            'guest:id,full_name', 'property:id,name,code',
            'pipelineStage:id,name,color,kind',
        ]));
    }

    public function destroy(int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        $inquiry->delete();
        return response()->json(['message' => 'Inquiry deleted']);
    }

    /**
     * GET /v1/admin/inquiries/{id}/delete-impact — blast-radius preview
     * for the confirm-delete modal. Counts related rows the destroy()
     * cascade would orphan (or take with it), plus any warnings the UI
     * should surface before the rep commits.
     */
    public function deleteImpact(int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);

        $activities   = Activity::where('inquiry_id', $id)->count();
        $tasks        = Task::where('inquiry_id', $id)->count();
        $attachments  = InquiryAttachment::where('inquiry_id', $id)->count();
        $reservations = Reservation::where('inquiry_id', $id)->count();

        $warnings = [];
        if ($reservations > 0) {
            // Inquiries usually only auto-link a reservation when marked
            // Won. A confirmed reservation on the books is a hard signal
            // that this row isn't garbage — surface it explicitly.
            $hasConfirmed = Reservation::where('inquiry_id', $id)
                ->where('status', 'Confirmed')
                ->exists();
            $warnings[] = $hasConfirmed
                ? 'This lead is linked to a confirmed reservation — deleting will detach the reservation but not remove it.'
                : 'This lead has linked reservation(s) — deletion will detach them.';
        }

        return response()->json([
            'activities'   => $activities,
            'tasks'        => $tasks,
            'attachments'  => $attachments,
            'reservations' => $reservations,
            'warnings'     => $warnings,
        ]);
    }

    public function completeTask(int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        $inquiry->update(['next_task_completed' => true]);
        return response()->json(['success' => true]);
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/log-contact — record an outbound
     * touch on the inquiry.
     *
     * Increments the per-channel counter where one exists
     * (phone_calls_made / emails_sent), always bumps last_contacted_at,
     * and writes a row to guest_activities for the linked guest so the
     * activity timeline + journey view both pick it up. Channels:
     * call | email | sms | whatsapp.
     */
    public function logContact(Request $request, int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        $validated = $request->validate([
            'channel' => 'required|string|in:call,email,sms,whatsapp',
            'note'    => 'nullable|string|max:500',
        ]);

        $patch = ['last_contacted_at' => now()];
        if (!empty($validated['note'])) $patch['last_contact_comment'] = $validated['note'];

        if ($validated['channel'] === 'call') {
            $patch['phone_calls_made'] = (int) ($inquiry->phone_calls_made ?? 0) + 1;
        }
        if ($validated['channel'] === 'email') {
            $patch['emails_sent'] = (int) ($inquiry->emails_sent ?? 0) + 1;
        }
        $inquiry->update($patch);

        // Mirror to the guest's activity log so reception, the journey
        // timeline, and any future per-guest analytics all see the same
        // event. Best-effort: a missing guest just skips the log instead
        // of failing the contact bump.
        if ($inquiry->guest_id) {
            try {
                \App\Models\GuestActivity::create([
                    'guest_id'     => $inquiry->guest_id,
                    'type'         => $validated['channel'],
                    'description'  => "Logged from inquiry #{$inquiry->id}" . (!empty($validated['note']) ? " — {$validated['note']}" : ''),
                    'performed_by' => $request->user()?->name,
                ]);
                \App\Models\Guest::where('id', $inquiry->guest_id)->update(['last_activity_at' => now()]);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('logContact: activity mirror failed', ['error' => $e->getMessage(), 'inquiry_id' => $inquiry->id]);
            }
        }

        return response()->json([
            'success'            => true,
            'phone_calls_made'   => $inquiry->fresh()->phone_calls_made,
            'emails_sent'        => $inquiry->fresh()->emails_sent,
            'last_contacted_at'  => $inquiry->fresh()->last_contacted_at,
        ]);
    }

    /**
     * GET /v1/admin/inquiries/kpis — top-of-page headline numbers for the
     * leads pipeline redesign.
     *
     * Returns 5 numbers with month/week deltas:
     *   - total          : total open inquiries (everything not Confirmed/Lost)
     *   - due_today      : open inquiries with next_task_due == today and not done
     *   - overdue        : open inquiries with next_task_due < today and not done
     *   - estimated_value: sum(total_value) over open inquiries
     *   - new_this_week  : inquiries created in last 7 days
     *
     * Deltas are vs prior period (last 7 days for "new", last 30 days for "total").
     */
    public function kpis(): JsonResponse
    {
        $todayStr     = now()->toDateString();
        $weekAgo      = now()->subDays(7);
        $twoWeeksAgo  = now()->subDays(14);
        $monthAgo     = now()->subDays(30);
        $twoMonthsAgo = now()->subDays(60);

        $openScope = fn ($q) => $q->whereNotIn('status', ['Confirmed', 'Lost']);

        $total = Inquiry::where($openScope)->count();
        $totalMonthAgo = Inquiry::where($openScope)
            ->where('created_at', '<', $monthAgo)
            ->count();
        $totalPrevMonth = Inquiry::where($openScope)
            ->where('created_at', '<', $twoMonthsAgo)
            ->count();
        $totalPct = $totalPrevMonth > 0
            ? round((($totalMonthAgo - $totalPrevMonth) / $totalPrevMonth) * 100)
            : null;

        $dueToday = Inquiry::where($openScope)
            ->where('next_task_completed', false)
            ->where('next_task_due', $todayStr)
            ->count();

        $overdue = Inquiry::where($openScope)
            ->where('next_task_completed', false)
            ->whereNotNull('next_task_due')
            ->where('next_task_due', '<', $todayStr)
            ->count();

        $estimatedValue = (float) Inquiry::where($openScope)
            ->whereNotNull('total_value')
            ->sum('total_value');

        $newThisWeek = Inquiry::where('created_at', '>=', $weekAgo)->count();
        $newLastWeek = Inquiry::whereBetween('created_at', [$twoWeeksAgo, $weekAgo])->count();
        $newPct = $newLastWeek > 0
            ? round((($newThisWeek - $newLastWeek) / $newLastWeek) * 100)
            : null;

        return response()->json([
            'total'           => $total,
            'total_delta_pct' => $totalPct,
            'due_today'       => $dueToday,
            'overdue'         => $overdue,
            'estimated_value' => round($estimatedValue, 2),
            'new_this_week'   => $newThisWeek,
            'new_delta_pct'   => $newPct,
        ]);
    }

    /**
     * GET /v1/admin/inquiries/insights — deterministic pipeline signals.
     *
     * These are the four "where is your team losing money?" buckets a
     * sales manager actually wants surfaced. Pure SQL, no AI: the
     * signals matter precisely BECAUSE they're explainable. Each
     * category includes a short sample list so the panel doesn't need
     * a second round-trip to render guests.
     *
     *   1. Going cold      — open & no activity 7+ days
     *   2. High value      — top 5 by total_value, not closed
     *   3. Unassigned      — open, 3+ days old, no assigned_to
     *   4. Stuck           — same status for 14+ days, not closed
     */
    public function insights(): JsonResponse
    {
        $sevenDaysAgo    = now()->subDays(7);
        $threeDaysAgo    = now()->subDays(3);
        $fourteenDaysAgo = now()->subDays(14);

        $openScope = fn ($q) => $q->whereNotIn('status', ['Confirmed', 'Lost']);
        $cols = ['id', 'guest_id', 'property_id', 'status', 'priority',
                 'check_in', 'check_out', 'num_rooms', 'total_value',
                 'assigned_to', 'last_contacted_at', 'updated_at', 'created_at'];

        // 1. Going cold
        $coldQ = Inquiry::with(['guest:id,full_name,company,email,phone', 'property:id,name'])
            ->where($openScope)
            ->where(function ($q) use ($sevenDaysAgo) {
                $q->whereNull('last_contacted_at')->where('created_at', '<', $sevenDaysAgo);
                $q->orWhere('last_contacted_at', '<', $sevenDaysAgo);
            });
        $coldCount = (clone $coldQ)->count();
        $coldSample = (clone $coldQ)->orderBy('updated_at')->limit(8)->get($cols);

        // 2. High-value at risk
        $hiValQ = Inquiry::with(['guest:id,full_name,company,email,phone', 'property:id,name'])
            ->where($openScope)
            ->whereNotNull('total_value')
            ->where('total_value', '>', 0);
        $hiValSample = (clone $hiValQ)->orderByDesc('total_value')->limit(5)->get($cols);
        $hiValSum = (clone $hiValQ)->sum('total_value');

        // 3. Unassigned
        $unassignedQ = Inquiry::with(['guest:id,full_name,company,email,phone', 'property:id,name'])
            ->where($openScope)
            ->whereNull('assigned_to')
            ->where('created_at', '<', $threeDaysAgo);
        $unassignedCount = (clone $unassignedQ)->count();
        $unassignedSample = (clone $unassignedQ)->orderBy('created_at')->limit(8)->get($cols);

        // 4. Stuck — not updated in 14+ days
        $stuckQ = Inquiry::with(['guest:id,full_name,company,email,phone', 'property:id,name'])
            ->where($openScope)
            ->where('updated_at', '<', $fourteenDaysAgo);
        $stuckCount = (clone $stuckQ)->count();
        $stuckSample = (clone $stuckQ)->orderBy('updated_at')->limit(8)->get($cols);

        return response()->json([
            'cold'       => ['count' => $coldCount,       'sample' => $coldSample],
            'high_value' => ['total' => round((float) $hiValSum, 2), 'sample' => $hiValSample],
            'unassigned' => ['count' => $unassignedCount, 'sample' => $unassignedSample],
            'stuck'      => ['count' => $stuckCount,      'sample' => $stuckSample],
        ]);
    }

    /**
     * GET /v1/admin/inquiries/today — sales daily-ops snapshot.
     *
     * Distinct from `dashboard` (period totals): this is what reps need
     * to see when they open the page in the morning — overdue + due-today
     * + due-soon tasks, plus the freshest leads from the last 24h.
     */
    public function today(): JsonResponse
    {
        $todayStr = now()->toDateString();
        $threeDaysOut = now()->addDays(3)->toDateString();

        $base = Inquiry::with(['guest:id,full_name,company,email,phone', 'property:id,name,code'])
            ->whereNotIn('status', ['Confirmed', 'Lost'])
            ->where('next_task_completed', false)
            ->whereNotNull('next_task_due');

        $overdue = (clone $base)->where('next_task_due', '<', $todayStr)
            ->orderBy('next_task_due')->limit(25)->get();
        $today = (clone $base)->where('next_task_due', $todayStr)
            ->orderBy('next_task_due')->limit(25)->get();
        $soon = (clone $base)
            ->whereBetween('next_task_due', [now()->addDay()->toDateString(), $threeDaysOut])
            ->orderBy('next_task_due')->limit(25)->get();

        $newLeads = Inquiry::with(['guest:id,full_name,company', 'property:id,name'])
            ->where('created_at', '>=', now()->subDay())
            ->orderByDesc('created_at')
            ->limit(15)
            ->get();

        return response()->json([
            'date'        => $todayStr,
            'overdue'     => ['count' => $overdue->count(), 'tasks' => $overdue],
            'today'       => ['count' => $today->count(),   'tasks' => $today],
            'soon'        => ['count' => $soon->count(),    'tasks' => $soon],
            'new_leads'   => ['count' => $newLeads->count(), 'leads' => $newLeads],
        ]);
    }

    /**
     * POST /v1/admin/inquiries/bulk — apply one action to many inquiries.
     *
     * Supports status changes (including the auto-reservation-on-Confirmed
     * path that Inquiry::saving handles), priority change, owner reassign.
     * Each row updated individually so model events fire — keeps the
     * inquiry → reservation conversion working in bulk too.
     */
    public function bulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'    => 'required|array|min:1|max:500',
            'ids.*'  => 'integer',
            'action' => 'required|string|in:set_status,set_priority,set_assigned_to,mark_won,mark_lost,mark_for_reengagement,delete',
            'value'  => 'nullable|string|max:150',
        ]);

        // Bulk delete — early-return path. Tenant scope guarantees only
        // current-org rows resolve via Inquiry::find(), but we double-
        // check organization_id defensively in case a future caller
        // bypasses TenantScope. Wraps in DB::transaction so a mid-loop
        // failure doesn't leave half-deleted batches.
        if ($validated['action'] === 'delete') {
            $deleted = 0;
            $currentOrgId = app()->bound('current_organization_id')
                ? app('current_organization_id')
                : null;

            \Illuminate\Support\Facades\DB::transaction(function () use ($validated, &$deleted, $currentOrgId) {
                foreach ($validated['ids'] as $id) {
                    $inquiry = Inquiry::find($id);
                    if (!$inquiry) continue;
                    if ($currentOrgId !== null && $inquiry->organization_id !== $currentOrgId) continue;
                    $inquiry->delete();
                    $deleted++;
                }
            });

            // Compliance: bulk inquiry deletes leave a forensic trail.
            // The sister GuestController bulkDelete already writes an
            // audit row; without this one a mass-delete of 500 leads is
            // invisible. See AUDIT-2026-06-13-ADDENDUM.md observability
            // finding.
            AuditLog::create([
                'organization_id' => $request->user()?->organization_id,
                'user_id'         => $request->user()?->id,
                'action'          => 'inquiry.bulk_delete',
                'subject_type'    => 'inquiry',
                'subject_id'      => null,
                'new_values'      => [
                    'ids'     => $validated['ids'],
                    'deleted' => $deleted,
                ],
                'ip_address'      => $request->ip(),
                'description'     => "Bulk-deleted {$deleted} inquiry/inquiries",
            ]);

            return response()->json(['deleted' => $deleted]);
        }

        $updated = 0;
        // Wrap in a transaction with per-row locks so two concurrent
        // bulk runs targeting overlapping IDs serialise instead of
        // racing. Each row is re-fetched inside the transaction to
        // ensure model events fire on a fresh instance.
        \Illuminate\Support\Facades\DB::transaction(function () use ($validated, &$updated, $request) {
            // CRM Phase 4: Going-cold re-engagement — for each selected
            // inquiry, queue a follow-up Task (due tomorrow 9am) and log
            // an Activity (type=note) marking the deal as flagged.
            // Doesn't actually SEND an email yet (deferred — needs
            // template-pick UX); this gets the deal back on the rep's
            // radar, which is 80% of the value.
            if ($validated['action'] === 'mark_for_reengagement') {
                $userId = $request->user()?->id;
                $dueAt = now()->addDay()->setTime(9, 0);

                foreach ($validated['ids'] as $id) {
                    $inq = Inquiry::lockForUpdate()->find($id);
                    if (!$inq) continue;

                    \App\Models\Task::create([
                        'inquiry_id'  => $inq->id,
                        'guest_id'    => $inq->guest_id,
                        'type'        => 'email',
                        'title'       => 'Re-engage cold lead — '
                            . ($inq->guest?->full_name ?? "Inquiry #{$inq->id}"),
                        'description' => 'Bulk-flagged from the Going Cold panel. Last touch: '
                            . ($inq->last_contacted_at?->diffForHumans() ?? 'never logged') . '.',
                        'due_at'      => $dueAt,
                        'assigned_to' => $userId,
                        'created_by'  => $userId,
                    ]);

                    \App\Models\Activity::create([
                        'inquiry_id'  => $inq->id,
                        'guest_id'    => $inq->guest_id,
                        'type'        => 'note',
                        'subject'     => 'Re-engagement task queued',
                        'body'        => 'Bulk action from Going Cold panel — task scheduled for tomorrow 9am.',
                        'metadata'    => ['kind' => 'reengagement'],
                        'created_by'  => $userId,
                        'occurred_at' => now(),
                    ]);

                    $updated++;
                }
                return;
            }

            foreach ($validated['ids'] as $id) {
                $r = Inquiry::lockForUpdate()->find($id);
                if (!$r) continue;
                $patch = match ($validated['action']) {
                    'set_status'      => ['status' => $validated['value'] ?? $r->status],
                    'set_priority'    => ['priority' => $validated['value'] ?? $r->priority],
                    'set_assigned_to' => ['assigned_to' => $validated['value']],
                    'mark_won'        => ['status' => 'Confirmed'],
                    'mark_lost'       => ['status' => 'Lost'],
                };
                // update() (not raw query) so the model's saving hook
                // still creates a reservation when status flips to Confirmed.
                $r->update($patch);
                $updated++;
            }
        });

        if ($updated === 0) {
            return response()->json(['updated' => 0, 'message' => 'No matching inquiries.']);
        }

        // Forensic record of bulk updates — closes the parity gap with
        // the bulk_delete path above and matches the GuestController
        // bulkUpdate audit already in place.
        AuditLog::create([
            'organization_id' => $request->user()?->organization_id,
            'user_id'         => $request->user()?->id,
            'action'          => 'inquiry.bulk_' . $validated['action'],
            'subject_type'    => 'inquiry',
            'subject_id'      => null,
            'new_values'      => [
                'ids'     => $validated['ids'],
                'action'  => $validated['action'],
                'value'   => $validated['value'] ?? null,
                'updated' => $updated,
            ],
            'ip_address'      => $request->ip(),
            'description'     => "Bulk {$validated['action']} on {$updated} inquir"
                . ($updated === 1 ? 'y' : 'ies'),
        ]);

        $message = match ($validated['action']) {
            'mark_for_reengagement' => "{$updated} re-engagement task" . ($updated === 1 ? '' : 's') . ' queued for tomorrow 9am.',
            default                 => "{$updated} inquir" . ($updated === 1 ? 'y' : 'ies') . ' updated.',
        };

        return response()->json([
            'updated' => $updated,
            'message' => $message,
        ]);
    }

    /**
     * GET /v1/admin/inquiries/export — download the filtered lead list.
     *
     * Default output is a styled .xlsx workbook (frozen header,
     * autofilter, brand header row, zebra rows, money/number formats);
     * `?format=csv` keeps the old plain-CSV shape for imports into
     * other tools. Both formats share one column map, which now
     * includes the guest's CONTACT details (email / phone / mobile),
     * pipeline + stage, party size, payment state, event block, lost
     * reason, follow-up dates, notes and every active inquiry custom
     * field — the old CSV silently dropped all of those.
     */
    public function export(Request $request): StreamedResponse|BinaryFileResponse
    {
        $query = Inquiry::with([
            'guest:id,full_name,email,phone,mobile,company',
            'property:id,name',
            'pipeline:id,name',
            'pipelineStage:id,name',
            'lostReason:id,label',
        ]);

        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('event_name', 'ilike', "%$s%")
                  ->orWhere('room_type_requested', 'ilike', "%$s%")
                  ->orWhereHas('guest', fn($q2) => $q2->where('full_name', 'ilike', "%$s%")->orWhere('company', 'ilike', "%$s%"));
            });
        }
        if ($v = $request->get('status'))        $query->where('status', $v);
        if ($v = $request->get('priority'))      $query->where('priority', $v);
        if ($v = $request->get('inquiry_type'))  $query->where('inquiry_type', $v);
        if ($v = $request->get('property_id'))   $query->where('property_id', $v);
        if ($v = $request->get('assigned_to'))   $query->where('assigned_to', $v);
        if ($v = $request->get('source'))        $query->where('source', $v);
        if ($v = $request->get('date_from'))     $query->where('created_at', '>=', $v);
        if ($v = $request->get('date_to'))       $query->where('created_at', '<=', $v . ' 23:59:59');
        if ($v = $request->get('check_in_from')) $query->where('check_in', '>=', $v);
        if ($v = $request->get('check_in_to'))   $query->where('check_in', '<=', $v);
        if ($request->get('active_only'))        $query->whereNotIn('status', ['Confirmed', 'Lost']);
        if ($v = $request->get('task_due')) {
            match ($v) {
                'today'   => $query->where('next_task_due', now()->toDateString())->where('next_task_completed', false),
                'overdue' => $query->where('next_task_due', '<', now()->toDateString())->where('next_task_completed', false),
                'soon'    => $query->whereBetween('next_task_due', [now()->toDateString(), now()->addDays(3)->toDateString()])->where('next_task_completed', false),
                default   => null,
            };
        }
        // `ids` filter — bulk export of checked rows only. Accepts an
        // array or a comma-separated list (parity with guests/export).
        if ($v = $request->get('ids')) {
            $ids = is_array($v) ? $v : explode(',', (string) $v);
            $query->whereIn('id', array_filter($ids, 'is_numeric'));
        }

        // Active admin-defined custom fields become trailing columns.
        // TenantScope keeps this org-local.
        $customFields = CustomField::where('entity', 'inquiry')
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $columns = [
            ['header' => 'ID',               'width' => 7,  'type' => 'number'],
            ['header' => 'Created',          'width' => 11],
            ['header' => 'Guest',            'width' => 22],
            ['header' => 'Email',            'width' => 26],
            ['header' => 'Phone',            'width' => 16],
            ['header' => 'Mobile',           'width' => 16],
            ['header' => 'Company',          'width' => 20],
            ['header' => 'Property',         'width' => 18],
            ['header' => 'Type',             'width' => 12],
            ['header' => 'Status',           'width' => 12],
            ['header' => 'Pipeline',         'width' => 14],
            ['header' => 'Stage',            'width' => 15],
            ['header' => 'Priority',         'width' => 10],
            ['header' => 'Check-in',         'width' => 11],
            ['header' => 'Check-out',        'width' => 11],
            ['header' => 'Nights',           'width' => 8,  'type' => 'number'],
            ['header' => 'Rooms',            'width' => 8,  'type' => 'number'],
            ['header' => 'Adults',           'width' => 8,  'type' => 'number'],
            ['header' => 'Children',         'width' => 9,  'type' => 'number'],
            ['header' => 'Room Type',        'width' => 16],
            ['header' => 'Rate',             'width' => 12, 'type' => 'money'],
            ['header' => 'Total Value',      'width' => 13, 'type' => 'money'],
            ['header' => 'Currency',         'width' => 9],
            ['header' => 'Paid Amount',      'width' => 12, 'type' => 'money'],
            ['header' => 'Payment Status',   'width' => 14],
            ['header' => 'Assigned To',      'width' => 16],
            ['header' => 'Source',           'width' => 14],
            ['header' => 'Event Type',       'width' => 13],
            ['header' => 'Event Name',       'width' => 20],
            ['header' => 'Event Pax',        'width' => 10, 'type' => 'number'],
            ['header' => 'Lost Reason',      'width' => 18],
            ['header' => 'Next Task Due',    'width' => 13],
            ['header' => 'Last Contacted',   'width' => 13],
            ['header' => 'Special Requests', 'width' => 30, 'type' => 'wrap'],
            ['header' => 'Notes',            'width' => 34, 'type' => 'wrap'],
        ];
        foreach ($customFields as $cf) {
            $columns[] = [
                'header' => $cf->label,
                'width'  => 16,
                'type'   => $cf->type === 'number' ? 'number' : 'text',
            ];
        }

        $mapRow = function ($r) use ($customFields) {
            $row = [
                $r->id, $r->created_at?->toDateString(),
                $r->guest?->full_name, $r->guest?->email, $r->guest?->phone, $r->guest?->mobile,
                $r->guest?->company, $r->property?->name, $r->inquiry_type, $r->status,
                $r->pipeline?->name, $r->pipelineStage?->name, $r->priority,
                $r->check_in?->toDateString(), $r->check_out?->toDateString(),
                $r->num_nights, $r->num_rooms, $r->num_adults, $r->num_children,
                $r->room_type_requested, $r->rate_offered, $r->total_value, $r->currency,
                $r->paid_amount, $r->payment_status, $r->assigned_to, $r->source,
                $r->event_type, $r->event_name, $r->event_pax,
                $r->lostReason?->label, $r->next_task_due?->toDateString(),
                $r->last_contacted_at?->toDateString(), $r->special_requests, $r->notes,
            ];
            foreach ($customFields as $cf) {
                $row[] = $this->customFields->exportValue($r->custom_data, $cf);
            }
            return $row;
        };

        $stamp = date('Y-m-d');

        if ($request->get('format') === 'csv') {
            return response()->streamDownload(function () use ($query, $columns, $mapRow) {
                $out = fopen('php://output', 'w');
                fwrite($out, "\xEF\xBB\xBF");
                fputcsv($out, array_column($columns, 'header'));
                $query->chunk(500, function ($rows) use ($out, $mapRow) {
                    foreach ($rows as $r) fputcsv($out, $mapRow($r));
                });
                fclose($out);
            }, "leads-{$stamp}.csv", ['Content-Type' => 'text/csv']);
        }

        $xlsx = new XlsxWriter('Leads');
        $xlsx->setColumns($columns);
        $query->chunk(500, function ($rows) use ($xlsx, $mapRow) {
            foreach ($rows as $r) $xlsx->addRow($mapRow($r));
        });

        return response()->download($xlsx->toTempFile(), "leads-{$stamp}.xlsx", [
            'Content-Type' => XlsxWriter::MIME,
        ])->deleteFileAfterSend(true);
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/ai-brief — fetch or refresh
     * the Smart Panel brief. Cached on the inquiry row for 15 min;
     * `?refresh=1` (or body `force_refresh=true`) forces a new
     * OpenAI call.
     */
    public function aiBrief(Request $request, int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        $force = (bool) ($request->get('refresh') ?? $request->get('force_refresh'));
        return response()->json($this->ai->briefForInquiry($inquiry, $force));
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/won — close the inquiry as won.
     *
     * Moves the inquiry to the pipeline's won stage, mirrors the legacy
     * `status` to "Confirmed", logs a status_change activity, and (when
     * the org has property + dates) auto-creates a draft Reservation.
     * Idempotent — returns the existing reservation if one is already
     * linked.
     */
    public function markWon(Request $request, int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        $request->validate([
            'note' => 'nullable|string|max:1000',
        ]);

        $wonStage = PipelineStage::where('pipeline_id', $inquiry->pipeline_id)
            ->where('kind', 'won')
            ->orderBy('sort_order')
            ->first();

        $reservation = DB::transaction(function () use ($inquiry, $wonStage, $request) {
            $previousStage = $inquiry->pipelineStage?->name ?? $inquiry->status;

            $inquiry->forceFill([
                'status'            => 'Confirmed',
                'pipeline_stage_id' => $wonStage?->id ?? $inquiry->pipeline_stage_id,
                'lost_reason_id'    => null, // Clear any prior Lost selection.
            ])->save();

            // Log the transition on the timeline.
            Activity::create([
                'inquiry_id' => $inquiry->id,
                'guest_id'   => $inquiry->guest_id,
                'type'       => 'status_change',
                'subject'    => 'Marked Won',
                'body'       => trim(
                    "Stage: {$previousStage} → " . ($wonStage?->name ?? 'Confirmed')
                    . ($request->note ? "\n\n{$request->note}" : '')
                ),
                'created_by' => $request->user()?->id,
                'occurred_at' => now(),
                'metadata'   => ['kind' => 'won'],
            ]);

            // Auto-create a draft reservation if one isn't already linked
            // and we have enough info to seed it (property + dates).
            $reservation = $inquiry->reservations()->first();
            if (!$reservation && $inquiry->property_id && $inquiry->check_in && $inquiry->check_out) {
                $confNo = strtoupper($inquiry->property?->code ?? 'HTL') . '-' . str_pad((string) $inquiry->id, 5, '0', STR_PAD_LEFT);
                $reservation = Reservation::create([
                    'guest_id'             => $inquiry->guest_id,
                    'inquiry_id'           => $inquiry->id,
                    'corporate_account_id' => $inquiry->corporate_account_id,
                    'property_id'          => $inquiry->property_id,
                    'confirmation_no'      => $confNo,
                    'check_in'             => $inquiry->check_in,
                    'check_out'            => $inquiry->check_out,
                    'num_nights'           => $inquiry->num_nights,
                    'num_rooms'            => $inquiry->num_rooms,
                    'num_adults'           => $inquiry->num_adults,
                    'num_children'         => $inquiry->num_children,
                    'room_type'            => $inquiry->room_type_requested,
                    'rate_per_night'       => $inquiry->rate_offered,
                    'total_amount'         => $inquiry->total_value,
                    'source'               => $inquiry->source,
                    'special_requests'     => $inquiry->special_requests,
                    'status'               => 'Confirmed',
                    'payment_status'       => 'Pending',
                ]);
            }

            return $reservation;
        });

        return response()->json([
            'success'     => true,
            'inquiry'     => $inquiry->fresh()->load(['pipelineStage', 'guest:id,full_name']),
            'reservation' => $reservation,
            'message'     => $reservation
                ? 'Marked won — draft reservation created.'
                : 'Marked won.',
        ]);
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/lost — close the inquiry as lost.
     *
     * Requires a `lost_reason_id` from the org's seeded taxonomy so
     * pipeline reporting (Phase 4) gets explainable funnel-leak
     * data. Optional free-text note appended to the activity row.
     */
    public function markLost(Request $request, int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        $validated = $request->validate([
            'lost_reason_id' => 'required|integer|exists:inquiry_lost_reasons,id',
            'note'           => 'nullable|string|max:1000',
        ]);

        $lostStage = PipelineStage::where('pipeline_id', $inquiry->pipeline_id)
            ->where('kind', 'lost')
            ->orderBy('sort_order')
            ->first();

        $reason = InquiryLostReason::find($validated['lost_reason_id']);

        DB::transaction(function () use ($inquiry, $lostStage, $reason, $validated, $request) {
            $previousStage = $inquiry->pipelineStage?->name ?? $inquiry->status;

            $inquiry->forceFill([
                'status'            => 'Lost',
                'pipeline_stage_id' => $lostStage?->id ?? $inquiry->pipeline_stage_id,
                'lost_reason_id'    => $reason?->id,
            ])->save();

            Activity::create([
                'inquiry_id' => $inquiry->id,
                'guest_id'   => $inquiry->guest_id,
                'type'       => 'status_change',
                'subject'    => 'Marked Lost — ' . ($reason?->label ?? 'Unspecified'),
                'body'       => trim(
                    "Stage: {$previousStage} → " . ($lostStage?->name ?? 'Lost')
                    . (!empty($validated['note']) ? "\n\n{$validated['note']}" : '')
                ),
                'created_by' => $request->user()?->id,
                'occurred_at' => now(),
                'metadata'   => [
                    'kind'           => 'lost',
                    'lost_reason_id' => $reason?->id,
                    'lost_reason'    => $reason?->label,
                ],
            ]);
        });

        return response()->json([
            'success' => true,
            'inquiry' => $inquiry->fresh()->load(['pipelineStage', 'lostReason']),
            'message' => 'Marked lost — ' . ($reason?->label ?? 'reason recorded') . '.',
        ]);
    }

    /**
     * GET /v1/admin/inquiry-lost-reasons — taxonomy for the Lost
     * picker. Returns active reasons in display order.
     */
    public function lostReasons(): JsonResponse
    {
        $reasons = InquiryLostReason::where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'label', 'slug', 'sort_order']);

        return response()->json($reasons);
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/guess-lost-reason — AI guesser
     * the Lost modal calls when the rep clicks "Suggest from timeline".
     * Returns the matched lost_reason_id + label + confidence + a one-
     * sentence rationale showing what evidence the model picked up on.
     */
    public function guessLostReason(int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        return response()->json($this->ai->guessLostReason($inquiry));
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/draft-proposal — drafts a
     * subject + body the agent can paste into an email composer or
     * the activity timeline. CRM Phase 5.
     */
    public function draftProposal(int $id): JsonResponse
    {
        $inquiry = Inquiry::withoutGlobalScope(\App\Scopes\BrandScope::class)->findOrFail($id);
        return response()->json($this->ai->draftProposal($inquiry));
    }
}
