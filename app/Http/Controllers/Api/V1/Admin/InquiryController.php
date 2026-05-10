<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\Inquiry;
use App\Models\InquiryLostReason;
use App\Models\PipelineStage;
use App\Models\Reservation;
use App\Services\InquiryAiService;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InquiryController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
        protected InquiryAiService $ai,
    ) {}
    public function index(Request $request): JsonResponse
    {
        $query = Inquiry::with(['guest:id,full_name,company,vip_level,nationality', 'property:id,name,code', 'corporateAccount:id,company_name']);

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

        $sort = $request->get('sort', 'created_at');
        $dir  = $request->get('dir', 'desc');
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
        ]);

        if (!empty($v['check_in']) && !empty($v['check_out'])) {
            $v['num_nights'] = (int) date_diff(date_create($v['check_in']), date_create($v['check_out']))->days;
        }

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

    public function update(Request $request, Inquiry $inquiry): JsonResponse
    {
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
        ]);

        $checkIn  = $v['check_in'] ?? $inquiry->check_in?->toDateString();
        $checkOut = $v['check_out'] ?? $inquiry->check_out?->toDateString();
        if ($checkIn && $checkOut) {
            $v['num_nights'] = (int) date_diff(date_create($checkIn), date_create($checkOut))->days;
        }

        $inquiry->update($v);

        // Auto-create reservation when confirmed
        if (($v['status'] ?? null) === 'Confirmed' && !$inquiry->reservations()->exists() && $inquiry->property_id) {
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

        return response()->json($inquiry->fresh()->load(['guest:id,full_name', 'property:id,name,code']));
    }

    public function destroy(Inquiry $inquiry): JsonResponse
    {
        $inquiry->delete();
        return response()->json(['message' => 'Inquiry deleted']);
    }

    public function completeTask(Inquiry $inquiry): JsonResponse
    {
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
    public function logContact(Request $request, Inquiry $inquiry): JsonResponse
    {
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
            'action' => 'required|string|in:set_status,set_priority,set_assigned_to,mark_won,mark_lost,mark_for_reengagement',
            'value'  => 'nullable|string|max:150',
        ]);

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

        $message = match ($validated['action']) {
            'mark_for_reengagement' => "{$updated} re-engagement task" . ($updated === 1 ? '' : 's') . ' queued for tomorrow 9am.',
            default                 => "{$updated} inquir" . ($updated === 1 ? 'y' : 'ies') . ' updated.',
        };

        return response()->json([
            'updated' => $updated,
            'message' => $message,
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $query = Inquiry::with(['guest:id,full_name,company', 'property:id,name']);

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

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['ID','Guest','Company','Property','Type','Check-in','Check-out','Nights','Rooms','Room Type','Rate','Total Value','Status','Priority','Assigned To','Source','Created']);
            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $r) {
                    fputcsv($out, [
                        $r->id, $r->guest?->full_name, $r->guest?->company, $r->property?->name,
                        $r->inquiry_type, $r->check_in?->toDateString(), $r->check_out?->toDateString(),
                        $r->num_nights, $r->num_rooms, $r->room_type_requested, $r->rate_offered,
                        $r->total_value, $r->status, $r->priority, $r->assigned_to, $r->source,
                        $r->created_at?->toDateString(),
                    ]);
                }
            });
            fclose($out);
        }, 'inquiries-' . date('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }

    /**
     * POST /v1/admin/inquiries/{inquiry}/ai-brief — fetch or refresh
     * the Smart Panel brief. Cached on the inquiry row for 15 min;
     * `?refresh=1` (or body `force_refresh=true`) forces a new
     * OpenAI call.
     */
    public function aiBrief(Request $request, Inquiry $inquiry): JsonResponse
    {
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
    public function markWon(Request $request, Inquiry $inquiry): JsonResponse
    {
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
    public function markLost(Request $request, Inquiry $inquiry): JsonResponse
    {
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
}
