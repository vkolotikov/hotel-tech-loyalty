<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Inquiry;
use App\Models\Reservation;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InquiryController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
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
        $inquiry->load(['guest', 'property', 'corporateAccount', 'reservations' => fn($q) => $q->latest()]);
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
}
