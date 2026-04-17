<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingExtra;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceExtra;
use App\Services\ServiceSchedulingService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ServiceBookingController extends Controller
{
    /** GET /v1/admin/service-bookings/dashboard — KPIs + analytics for service bookings. */
    public function dashboard(Request $request): JsonResponse
    {
        $period = $request->input('period', 'month');
        $from = match ($period) {
            'week'  => now()->subWeek(),
            'year'  => now()->subYear(),
            default => now()->subMonth(),
        };

        $all = ServiceBooking::with('service:id,name')
            ->where('created_at', '>=', $from)
            ->get();

        $total      = $all->count();
        $revenue    = $all->where('status', '!=', 'cancelled')->sum('total_amount');
        $confirmed  = $all->where('status', 'confirmed')->count();
        $completed  = $all->where('status', 'completed')->count();
        $cancelled  = $all->where('status', 'cancelled')->count();
        $noShow     = $all->where('status', 'no_show')->count();
        $upcoming   = ServiceBooking::where('start_at', '>=', now())
            ->whereIn('status', ['pending', 'confirmed'])
            ->count();

        // Service mix
        $serviceMix = $all->groupBy(fn ($b) => $b->service->name ?? 'Unknown')
            ->map(fn ($group, $name) => [
                'label' => $name,
                'count' => $group->count(),
                'total' => round($group->sum('total_amount'), 2),
            ])->values();

        // Booking pace (next 14 days)
        $start = now()->toDateString();
        $end   = now()->addDays(13)->toDateString();
        $counts = ServiceBooking::selectRaw('DATE(start_at) as d, COUNT(*) as cnt')
            ->whereBetween('start_at', [$start . ' 00:00:00', $end . ' 23:59:59'])
            ->where('status', '!=', 'cancelled')
            ->groupBy('d')
            ->pluck('cnt', 'd');

        $paceDays = [];
        for ($i = 0; $i < 14; $i++) {
            $d = now()->addDays($i)->toDateString();
            $paceDays[] = [
                'date'  => $d,
                'label' => now()->addDays($i)->format('D j'),
                'count' => (int) ($counts[$d] ?? 0),
            ];
        }

        $upcomingList = ServiceBooking::with(['service:id,name', 'master:id,name'])
            ->where('start_at', '>=', now())
            ->whereIn('status', ['pending', 'confirmed'])
            ->orderBy('start_at')
            ->limit(10)
            ->get();

        return response()->json([
            'scope' => ['period' => $period, 'from' => $from->toDateString(), 'to' => now()->toDateString()],
            'kpis' => [
                ['key' => 'total',     'label' => 'Total Bookings', 'value' => $total],
                ['key' => 'revenue',   'label' => 'Revenue',        'value' => round($revenue, 2)],
                ['key' => 'confirmed', 'label' => 'Confirmed',      'value' => $confirmed],
                ['key' => 'completed', 'label' => 'Completed',      'value' => $completed],
                ['key' => 'cancelled', 'label' => 'Cancelled',      'value' => $cancelled],
                ['key' => 'no_show',   'label' => 'No-show',        'value' => $noShow],
                ['key' => 'upcoming',  'label' => 'Upcoming',       'value' => $upcoming],
            ],
            'analytics' => [
                'serviceMix'  => $serviceMix,
                'bookingPace' => ['days' => $paceDays, 'total' => array_sum(array_column($paceDays, 'count'))],
            ],
            'upcoming' => $upcomingList,
        ]);
    }

    /** GET /v1/admin/service-bookings — paginated list. */
    public function index(Request $request): JsonResponse
    {
        $query = ServiceBooking::with(['service:id,name', 'master:id,name'])
            ->orderByDesc('start_at');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('customer_name', 'ilike', "%{$search}%")
                  ->orWhere('customer_email', 'ilike', "%{$search}%")
                  ->orWhere('booking_reference', 'ilike', "%{$search}%");
            });
        }
        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }
        if ($paymentStatus = $request->input('payment_status')) {
            $query->where('payment_status', $paymentStatus);
        }
        if ($serviceId = $request->input('service_id')) {
            $query->where('service_id', $serviceId);
        }
        if ($masterId = $request->input('master_id')) {
            $query->where('service_master_id', $masterId);
        }
        if ($from = $request->input('from')) {
            $query->where('start_at', '>=', $from);
        }
        if ($to = $request->input('to')) {
            $query->where('start_at', '<=', $to . ' 23:59:59');
        }

        return response()->json($query->paginate($request->integer('per_page', 25)));
    }

    /** GET /v1/admin/service-bookings/calendar?month=YYYY-MM */
    public function calendar(Request $request): JsonResponse
    {
        $month = $request->input('month', now()->format('Y-m'));
        $start = Carbon::parse($month . '-01')->startOfMonth();
        $end   = Carbon::parse($month . '-01')->endOfMonth();

        $bookings = ServiceBooking::with(['service:id,name,duration_minutes', 'master:id,name'])
            ->whereBetween('start_at', [$start, $end])
            ->where('status', '!=', 'cancelled')
            ->orderBy('start_at')
            ->get([
                'id', 'booking_reference', 'service_id', 'service_master_id',
                'customer_name', 'start_at', 'end_at', 'duration_minutes',
                'status', 'payment_status', 'total_amount',
            ]);

        return response()->json(['bookings' => $bookings, 'month' => $month]);
    }

    public function show(int $id): JsonResponse
    {
        $booking = ServiceBooking::with(['service', 'master', 'extras', 'guest', 'member'])
            ->findOrFail($id);

        $arr = $booking->toArray();
        $arr['submissions'] = ServiceBookingSubmission::where('service_booking_id', $booking->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json($arr);
    }

    /** POST /v1/admin/service-bookings — manual admin booking (walk-in/phone). */
    public function store(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $data = $request->validate([
            'service_id'        => 'required|integer|exists:services,id',
            'service_master_id' => 'nullable|integer|exists:service_masters,id',
            'customer_name'     => 'required|string|max:200',
            'customer_email'    => 'required|email|max:255',
            'customer_phone'    => 'nullable|string|max:40',
            'party_size'        => 'nullable|integer|min:1|max:50',
            'start_at'          => 'required|date',
            'source'            => 'nullable|string|in:admin,phone,walk_in',
            'customer_notes'    => 'nullable|string|max:2000',
            'staff_notes'       => 'nullable|string|max:2000',
            'extras'            => 'nullable|array',
            'extras.*.id'       => 'required_with:extras|integer|exists:service_extras,id',
            'extras.*.quantity' => 'nullable|integer|min:1|max:50',
        ]);

        $service = Service::findOrFail($data['service_id']);

        try {
            $reservation = $scheduler->reserveSlot(
                $service,
                $data['service_master_id'] ?? null,
                $data['start_at'],
            );
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 409);
        }

        return DB::transaction(function () use ($data, $service, $reservation, $request) {
            $partySize = (int) ($data['party_size'] ?? 1);
            $servicePrice = (float) $reservation['price'];

            $extrasTotal = 0;
            $extraRows = [];
            if (!empty($data['extras'])) {
                $extraIds = collect($data['extras'])->pluck('id')->all();
                $extraModels = ServiceExtra::whereIn('id', $extraIds)->get()->keyBy('id');
                foreach ($data['extras'] as $line) {
                    $extra = $extraModels->get($line['id']);
                    if (!$extra) continue;
                    $qty = (int) ($line['quantity'] ?? 1);
                    $multiplier = $extra->price_type === 'per_person' ? $partySize * $qty : $qty;
                    $lineTotal = round((float) $extra->price * $multiplier, 2);
                    $extrasTotal += $lineTotal;
                    $extraRows[] = [
                        'extra' => $extra,
                        'quantity' => $qty,
                        'line_total' => $lineTotal,
                    ];
                }
            }

            $orgId = app('current_organization_id');

            $booking = ServiceBooking::create([
                'organization_id'   => $orgId,
                'service_id'        => $service->id,
                'service_master_id' => $reservation['master']->id,
                'customer_name'     => $data['customer_name'],
                'customer_email'    => $data['customer_email'],
                'customer_phone'    => $data['customer_phone'] ?? null,
                'party_size'        => $partySize,
                'start_at'          => $reservation['start'],
                'end_at'            => $reservation['end'],
                'duration_minutes'  => $reservation['duration_minutes'],
                'service_price'     => $servicePrice,
                'extras_total'      => $extrasTotal,
                'total_amount'      => round($servicePrice + $extrasTotal, 2),
                'currency'          => $service->currency ?: 'EUR',
                'status'            => 'confirmed',
                'payment_status'    => 'unpaid',
                'source'            => $data['source'] ?? 'admin',
                'customer_notes'    => $data['customer_notes'] ?? null,
                'staff_notes'       => $data['staff_notes'] ?? null,
            ]);

            foreach ($extraRows as $row) {
                ServiceBookingExtra::create([
                    'organization_id'    => $orgId,
                    'service_booking_id' => $booking->id,
                    'service_extra_id'   => $row['extra']->id,
                    'name'               => $row['extra']->name,
                    'unit_price'         => $row['extra']->price,
                    'quantity'           => $row['quantity'],
                    'line_total'         => $row['line_total'],
                ]);
            }

            AuditLog::create([
                'organization_id' => $orgId,
                'user_id'         => $request->user()?->id,
                'action'          => 'service_booking.created',
                'description'     => "Created service booking {$booking->booking_reference} for {$booking->customer_name}",
            ]);

            return response()->json($booking->fresh(['service', 'master', 'extras']), 201);
        });
    }

    /** PATCH /v1/admin/service-bookings/{id}/status */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $booking = ServiceBooking::findOrFail($id);

        $data = $request->validate([
            'status'              => 'nullable|string|in:pending,confirmed,in_progress,completed,cancelled,no_show',
            'payment_status'      => 'nullable|string|in:unpaid,paid,refunded,failed',
            'cancellation_reason' => 'nullable|string|max:500',
            'staff_notes'         => 'nullable|string|max:2000',
        ]);

        if (($data['status'] ?? null) === 'cancelled' && !$booking->cancelled_at) {
            $data['cancelled_at'] = now();
        }

        $booking->update(array_filter($data, fn ($v) => $v !== null));

        AuditLog::create([
            'organization_id' => app('current_organization_id'),
            'user_id'         => $request->user()?->id,
            'action'          => 'service_booking.updated',
            'description'     => "Updated booking {$booking->booking_reference}",
        ]);

        return response()->json($booking->fresh(['service', 'master', 'extras']));
    }

    public function destroy(int $id): JsonResponse
    {
        $booking = ServiceBooking::findOrFail($id);
        $booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        return response()->json(['message' => 'Booking cancelled']);
    }

    /** GET /v1/admin/service-bookings/availability — for the admin "create booking" form. */
    public function availability(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $data = $request->validate([
            'service_id' => 'required|integer|exists:services,id',
            'master_id'  => 'nullable|integer|exists:service_masters,id',
            'date'       => 'required|date',
        ]);

        $service = Service::findOrFail($data['service_id']);
        $slots = $scheduler->availableSlots($service, $data['date'], $data['master_id'] ?? null, leadMinutes: 0);

        return response()->json(['slots' => $slots]);
    }

    /** GET /v1/admin/service-bookings/submissions */
    public function submissions(Request $request): JsonResponse
    {
        $query = ServiceBookingSubmission::orderByDesc('created_at');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('customer_name', 'ilike', "%{$search}%")
                  ->orWhere('customer_email', 'ilike', "%{$search}%");
            });
        }
        if ($outcome = $request->input('outcome')) {
            $query->where('outcome', $outcome);
        }

        return response()->json($query->paginate(25));
    }
}
