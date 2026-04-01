<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookingMirror;
use App\Models\BookingNote;
use App\Models\BookingSubmission;
use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BookingAdminController extends Controller
{
    /** GET /v1/admin/bookings/dashboard — booking KPIs. */
    public function dashboard(Request $request): JsonResponse
    {
        $period = $request->input('period', 'month');
        $from   = match ($period) {
            'week'  => now()->subWeek(),
            'year'  => now()->subYear(),
            default => now()->subMonth(),
        };

        $bookings = BookingMirror::where('created_at', '>=', $from);

        $total    = (clone $bookings)->count();
        $revenue  = (clone $bookings)->sum('price_total');
        $confirmed = (clone $bookings)->where('booking_state', 'confirmed')->count();
        $cancelled = (clone $bookings)->where('booking_state', 'cancelled')->count();

        $avgStay  = (clone $bookings)
            ->whereNotNull('arrival_date')
            ->whereNotNull('departure_date')
            ->selectRaw('AVG(departure_date - arrival_date) as avg_nights')
            ->value('avg_nights');

        $byUnit = BookingMirror::where('created_at', '>=', $from)
            ->whereNotNull('apartment_name')
            ->selectRaw('apartment_name, apartment_id, COUNT(*) as count, SUM(price_total) as revenue')
            ->groupBy('apartment_name', 'apartment_id')
            ->orderByDesc('count')
            ->get();

        $byChannel = BookingMirror::where('created_at', '>=', $from)
            ->whereNotNull('channel_name')
            ->selectRaw("channel_name, COUNT(*) as count")
            ->groupBy('channel_name')
            ->orderByDesc('count')
            ->get();

        // Upcoming arrivals (next 7 days)
        $arrivals = BookingMirror::whereBetween('arrival_date', [now()->toDateString(), now()->addDays(7)->toDateString()])
            ->where('booking_state', '!=', 'cancelled')
            ->orderBy('arrival_date')
            ->limit(10)
            ->get(['id', 'guest_name', 'apartment_name', 'arrival_date', 'departure_date', 'adults', 'children', 'internal_status']);

        return response()->json([
            'total'      => $total,
            'revenue'    => round((float) $revenue, 2),
            'confirmed'  => $confirmed,
            'cancelled'  => $cancelled,
            'avg_nights' => $avgStay ? round((float) $avgStay, 1) : 0,
            'by_unit'    => $byUnit,
            'by_channel' => $byChannel,
            'arrivals'   => $arrivals,
        ]);
    }

    /** GET /v1/admin/bookings — paginated booking list. */
    public function index(Request $request): JsonResponse
    {
        $query = BookingMirror::with('guest:id,first_name,last_name,email')
            ->orderByDesc('arrival_date');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('guest_name', 'ilike', "%{$search}%")
                  ->orWhere('guest_email', 'ilike', "%{$search}%")
                  ->orWhere('booking_reference', 'ilike', "%{$search}%")
                  ->orWhere('reservation_id', 'ilike', "%{$search}%");
            });
        }

        if ($status = $request->input('status')) {
            $query->where('internal_status', $status);
        }

        if ($unitId = $request->input('unit_id')) {
            $query->where('apartment_id', $unitId);
        }

        if ($from = $request->input('from')) {
            $query->where('arrival_date', '>=', $from);
        }
        if ($to = $request->input('to')) {
            $query->where('arrival_date', '<=', $to);
        }

        return response()->json($query->paginate($request->integer('per_page', 25)));
    }

    /** GET /v1/admin/bookings/{id} — single booking detail. */
    public function show(int $id): JsonResponse
    {
        $booking = BookingMirror::with(['priceElements', 'notes.staff', 'guest'])
            ->findOrFail($id);

        return response()->json($booking);
    }

    /** POST /v1/admin/bookings/{id}/notes — add a staff note. */
    public function addNote(Request $request, int $id): JsonResponse
    {
        $booking = BookingMirror::findOrFail($id);

        $validated = $request->validate(['body' => 'required|string|max:2000']);

        $staff = \App\Models\Staff::withoutGlobalScopes()
            ->where('user_id', $request->user()->id)
            ->first();

        BookingNote::create([
            'booking_mirror_id' => $booking->id,
            'reservation_id'    => $booking->reservation_id,
            'staff_id'          => $staff?->id,
            'body'              => $validated['body'],
            'created_at'        => now(),
        ]);

        return $this->show($id);
    }

    /** PATCH /v1/admin/bookings/{id}/status — update internal status. */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $booking = BookingMirror::findOrFail($id);

        $validated = $request->validate([
            'internal_status' => 'nullable|string|max:40',
            'invoice_state'   => 'nullable|string|max:40',
        ]);

        $booking->update(array_filter($validated, fn ($v) => $v !== null));

        return response()->json($booking->fresh());
    }

    /** POST /v1/admin/bookings/{id}/sync — re-fetch from PMS. */
    public function syncOne(int $id, BookingEngineService $service): JsonResponse
    {
        $booking = BookingMirror::findOrFail($id);
        $updated = $service->syncReservation($booking->reservation_id);

        return response()->json($updated);
    }

    /** POST /v1/admin/bookings/sync — bulk sync from PMS. */
    public function syncAll(Request $request, SmoobuClient $smoobu, BookingEngineService $service): JsonResponse
    {
        if ($smoobu->isMock()) {
            return response()->json(['message' => 'PMS is in mock mode — no real data to sync.', 'synced' => 0]);
        }

        $from = $request->input('from', now()->subMonths(3)->format('Y-m-d'));
        $to   = $request->input('to', now()->addMonths(3)->format('Y-m-d'));

        $page    = 1;
        $synced  = 0;
        $maxPages = 10;

        while ($page <= $maxPages) {
            $response = $smoobu->listReservations([
                'from'      => $from,
                'to'        => $to,
                'page'      => $page,
                'pageSize'  => 100,
            ]);

            $bookings = $response['bookings'] ?? [];
            if (empty($bookings)) break;

            foreach ($bookings as $b) {
                $service->syncReservation((string) ($b['id'] ?? ''));
                $synced++;
            }

            $totalPages = $response['page_count'] ?? 1;
            if ($page >= $totalPages) break;
            $page++;
        }

        return response()->json(['message' => "Synced {$synced} reservations.", 'synced' => $synced]);
    }

    /** GET /v1/admin/bookings/calendar — calendar view data. */
    public function calendar(Request $request): JsonResponse
    {
        $month = $request->input('month', now()->format('Y-m'));
        $start = \Carbon\Carbon::parse($month . '-01')->startOfMonth()->subDays(7);
        $end   = \Carbon\Carbon::parse($month . '-01')->endOfMonth()->addDays(7);

        $bookings = BookingMirror::where(function ($q) use ($start, $end) {
                $q->whereBetween('arrival_date', [$start, $end])
                  ->orWhereBetween('departure_date', [$start, $end])
                  ->orWhere(function ($q2) use ($start, $end) {
                      $q2->where('arrival_date', '<=', $start)
                         ->where('departure_date', '>=', $end);
                  });
            })
            ->where('booking_state', '!=', 'cancelled')
            ->get(['id', 'reservation_id', 'guest_name', 'apartment_id', 'apartment_name', 'arrival_date', 'departure_date', 'adults', 'children', 'internal_status', 'booking_state']);

        return response()->json([
            'bookings' => $bookings,
            'month'    => $month,
        ]);
    }

    /** GET /v1/admin/bookings/submissions — booking attempt log. */
    public function submissions(Request $request): JsonResponse
    {
        $query = BookingSubmission::orderByDesc('created_at');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('guest_name', 'ilike', "%{$search}%")
                  ->orWhere('guest_email', 'ilike', "%{$search}%")
                  ->orWhere('booking_reference', 'ilike', "%{$search}%");
            });
        }

        if ($outcome = $request->input('outcome')) {
            $query->where('outcome', $outcome);
        }

        return response()->json($query->paginate(25));
    }

    /** GET /v1/admin/bookings/payments — payment overview. */
    public function payments(Request $request): JsonResponse
    {
        $query = BookingMirror::whereNotNull('price_total')
            ->orderByDesc('arrival_date');

        if ($status = $request->input('payment_status')) {
            $query->where('payment_status', $status);
        }

        return response()->json($query->paginate(25));
    }
}
