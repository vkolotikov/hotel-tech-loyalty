<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\BookingNote;
use App\Models\BookingSubmission;
use App\Services\BookingEngineService;
use App\Services\PmsResolver;
use App\Services\SmoobuClient;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingAdminController extends Controller
{
    /** GET /v1/admin/bookings/dashboard — rich booking KPIs & analytics. */
    public function dashboard(Request $request): JsonResponse
    {
        $period = $request->input('period', 'month');
        $unitId = $request->input('unit_id');
        $from = match ($period) {
            'week'  => now()->subWeek(),
            'year'  => now()->subYear(),
            default => now()->subMonth(),
        };

        $base = BookingMirror::where('created_at', '>=', $from);
        if ($unitId) $base = $base->where('apartment_id', $unitId);

        $all = (clone $base)->get();

        $total     = $all->count();
        $revenue   = $all->sum('price_total');
        $paid      = $all->sum('price_paid');
        $confirmed = $all->where('booking_state', 'confirmed')->count();
        $cancelled = $all->where('booking_state', 'cancelled')->count();
        $pending   = $all->where('payment_status', 'pending')->count();
        $avgStay   = $all->filter(fn ($b) => $b->arrival_date && $b->departure_date)
            ->avg(fn ($b) => Carbon::parse($b->arrival_date)->diffInDays(Carbon::parse($b->departure_date)));

        // Payment mix analytics (donut chart)
        $paymentMix = $all->groupBy(fn ($b) => $b->payment_status ?: 'unknown')
            ->map(fn ($group, $key) => [
                'label' => $this->paymentStateLabel($key),
                'key'   => $key,
                'count' => $group->count(),
                'total' => round($group->sum('price_total'), 2),
            ])->values();

        // Arrivals timeline (bar chart — next 14 days) — single GROUP BY query
        $arrivalStart = now()->toDateString();
        $arrivalEnd   = now()->addDays(13)->toDateString();
        $arrivalQuery = BookingMirror::selectRaw('arrival_date, COUNT(*) as cnt')
            ->whereBetween('arrival_date', [$arrivalStart, $arrivalEnd])
            ->where('booking_state', '!=', 'cancelled')
            ->groupBy('arrival_date');
        if ($unitId) $arrivalQuery->where('apartment_id', $unitId);
        $arrivalCounts = $arrivalQuery->pluck('cnt', 'arrival_date');

        $arrivalDays = [];
        for ($i = 0; $i < 14; $i++) {
            $date = now()->addDays($i)->toDateString();
            $arrivalDays[] = [
                'date'  => $date,
                'label' => now()->addDays($i)->format('D j'),
                'count' => (int) ($arrivalCounts[$date] ?? 0),
            ];
        }

        // Unit performance (horizontal bars)
        $unitPerf = $all->groupBy('apartment_name')->map(fn ($group, $name) => [
            'unit_name'   => $name,
            'unit_id'     => $group->first()->apartment_id,
            'bookings'    => $group->count(),
            'revenue'     => round($group->sum('price_total'), 2),
            'paid'        => round($group->sum('price_paid'), 2),
            'balance'     => round($group->sum('price_total') - $group->sum('price_paid'), 2),
            'avg_nights'  => round($group->filter(fn ($b) => $b->arrival_date && $b->departure_date)
                ->avg(fn ($b) => Carbon::parse($b->arrival_date)->diffInDays(Carbon::parse($b->departure_date))), 1),
        ])->values();

        // Channel mix
        $channelMix = $all->groupBy(fn ($b) => $b->channel_name ?: 'Direct')
            ->map(fn ($group, $name) => [
                'label' => $name,
                'count' => $group->count(),
            ])->values();

        // Available units for filter dropdown
        $units = BookingMirror::whereNotNull('apartment_id')
            ->select('apartment_id', 'apartment_name')
            ->distinct()
            ->orderBy('apartment_name')
            ->get()
            ->map(fn ($u) => ['id' => $u->apartment_id, 'name' => $u->apartment_name]);

        // Recent unpaid bookings
        $recentUnpaid = BookingMirror::whereNotNull('price_total')
            ->whereRaw('COALESCE(price_paid, 0) < price_total')
            ->where('booking_state', '!=', 'cancelled')
            ->orderByDesc('arrival_date')
            ->limit(8)
            ->get(['id', 'reservation_id', 'booking_reference', 'guest_name', 'apartment_name',
                   'channel_name', 'arrival_date', 'departure_date', 'price_total', 'price_paid',
                   'payment_status', 'payment_method']);

        // Recent submissions
        $recentSubs = BookingSubmission::orderByDesc('created_at')
            ->limit(8)
            ->get(['id', 'outcome', 'guest_name', 'unit_name', 'check_in', 'check_out',
                   'gross_total', 'payment_method', 'created_at']);

        // Upcoming arrivals (next 7 days)
        $arrivalsQuery = BookingMirror::whereBetween('arrival_date', [now()->toDateString(), now()->addDays(7)->toDateString()])
            ->where('booking_state', '!=', 'cancelled')
            ->orderBy('arrival_date')
            ->limit(10);
        if ($unitId) $arrivalsQuery = $arrivalsQuery->where('apartment_id', $unitId);
        $arrivals = $arrivalsQuery->get(['id', 'guest_name', 'apartment_name', 'arrival_date', 'departure_date', 'adults', 'children', 'internal_status', 'payment_status']);

        // Sync health
        $lastSync = AuditLog::where('action', 'like', 'booking.%')->orderByDesc('created_at')->first();
        $mirrorCount = BookingMirror::count();

        // Scope info
        $periodLabel = ucfirst($period);
        $scopeLabel = "Last {$periodLabel}";

        return response()->json([
            'scope' => [
                'period' => $period,
                'label'  => $scopeLabel,
                'from'   => $from->toDateString(),
                'to'     => now()->toDateString(),
            ],
            'filters' => ['units' => $units],
            'kpis' => [
                ['key' => 'total_bookings', 'label' => 'Total Bookings', 'value' => $total, 'displayValue' => (string) $total],
                ['key' => 'revenue', 'label' => 'Revenue', 'value' => $revenue, 'displayValue' => '€' . number_format($revenue, 0)],
                ['key' => 'confirmed', 'label' => 'Confirmed', 'value' => $confirmed, 'displayValue' => (string) $confirmed],
                ['key' => 'cancelled', 'label' => 'Cancelled', 'value' => $cancelled, 'displayValue' => (string) $cancelled],
                ['key' => 'pending_payment', 'label' => 'Pending Payment', 'value' => $pending, 'displayValue' => (string) $pending],
                ['key' => 'avg_stay', 'label' => 'Avg Stay', 'value' => round($avgStay ?? 0, 1), 'displayValue' => round($avgStay ?? 0, 1) . ' nights'],
                ['key' => 'balance_due', 'label' => 'Balance Due', 'value' => round($revenue - $paid, 2), 'displayValue' => '€' . number_format($revenue - $paid, 0)],
            ],
            'analytics' => [
                'paymentMix'      => $paymentMix,
                'arrivalPace'     => ['days' => $arrivalDays, 'total' => array_sum(array_column($arrivalDays, 'count'))],
                'unitPerformance' => $unitPerf,
                'channelMix'      => $channelMix,
            ],
            'arrivals'             => $arrivals,
            'recentUnpaidBookings' => $recentUnpaid,
            'recentSubmissions'    => $recentSubs,
            'syncHealth' => (function () use ($lastSync, $mirrorCount) {
                $pms = app(PmsResolver::class)->activePms();
                return [
                    'lastSyncAt'           => $lastSync?->created_at?->toIso8601String(),
                    'mirroredBookingCount' => $mirrorCount,
                    'pmsEnabled'           => $pms !== null,
                    'pmsName'              => $pms['name'] ?? null,
                    'pmsSyncable'          => $pms['syncable'] ?? false,
                ];
            })(),
        ]);
    }

    /** GET /v1/admin/bookings — paginated booking list with full filters. */
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
        if ($paymentState = $request->input('payment_status')) {
            $query->where('payment_status', $paymentState);
        }
        if ($unitId = $request->input('unit_id')) {
            $query->where('apartment_id', $unitId);
        }
        if ($state = $request->input('booking_state')) {
            $query->where('booking_state', $state);
        }
        if ($from = $request->input('from')) {
            $query->where('arrival_date', '>=', $from);
        }
        if ($to = $request->input('to')) {
            $query->where('arrival_date', '<=', $to);
        }

        $paginated = $query->paginate($request->integer('per_page', 25));

        // Add computed balance_due to each item
        $items = collect($paginated->items())->map(function ($b) {
            $arr = $b->toArray();
            $arr['balance_due'] = round(($b->price_total ?? 0) - ($b->price_paid ?? 0), 2);
            return $arr;
        });

        // Available units for filter dropdown
        $units = BookingMirror::whereNotNull('apartment_id')
            ->select('apartment_id', 'apartment_name')
            ->distinct()
            ->orderBy('apartment_name')
            ->get()
            ->map(fn ($u) => ['id' => $u->apartment_id, 'name' => $u->apartment_name]);

        return response()->json([
            'data'         => $items,
            'current_page' => $paginated->currentPage(),
            'last_page'    => $paginated->lastPage(),
            'per_page'     => $paginated->perPage(),
            'total'        => $paginated->total(),
            'filters'      => ['units' => $units],
        ]);
    }

    /** GET /v1/admin/bookings/{id} — full booking detail with related data. */
    public function show(int $id): JsonResponse
    {
        $booking = BookingMirror::with(['priceElements', 'notes.staff', 'guest'])
            ->findOrFail($id);

        $arr = $booking->toArray();
        $arr['balance_due'] = round(($booking->price_total ?? 0) - ($booking->price_paid ?? 0), 2);

        // Related submissions
        $arr['submissions'] = BookingSubmission::where('reservation_id', $booking->reservation_id)
            ->orWhere('booking_reference', $booking->booking_reference)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json($arr);
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

    /** PATCH /v1/admin/bookings/{id}/status — update internal status / invoice / payment. */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $booking = BookingMirror::findOrFail($id);

        $validated = $request->validate([
            'internal_status' => 'nullable|string|max:40',
            'invoice_state'   => 'nullable|string|max:40',
            'payment_status'  => 'nullable|string|max:40',
            'price_paid'      => 'nullable|numeric|min:0',
        ]);

        $booking->update(array_filter($validated, fn ($v) => $v !== null));

        return $this->show($id);
    }

    /** POST /v1/admin/bookings/{id}/sync — re-fetch from PMS. */
    public function syncOne(int $id, BookingEngineService $service): JsonResponse
    {
        $booking = BookingMirror::findOrFail($id);
        $service->syncReservation($booking->reservation_id);
        return $this->show($id);
    }

    /** POST /v1/admin/bookings/sync — bulk sync from PMS. */
    public function syncAll(Request $request, SmoobuClient $smoobu, BookingEngineService $service): JsonResponse
    {
        $activePms = app(PmsResolver::class)->activePms();

        // Always sync apartments (works in both mock and live mode)
        try { $this->syncApartments($smoobu); } catch (\Throwable) {}

        if (!$activePms) {
            return response()->json(['message' => 'No PMS integration configured. Connect a provider in Settings → Integrations to sync bookings.', 'synced' => 0]);
        }

        if (!$activePms['syncable']) {
            return response()->json(['message' => "{$activePms['name']} is connected but booking sync is not yet supported for this provider.", 'synced' => 0]);
        }

        if ($smoobu->isMock()) {
            return response()->json(['message' => "Smoobu API key is missing or invalid. Check your credentials in Settings → Integrations.", 'synced' => 0]);
        }

        try {
            $from = $request->input('from', now()->subMonths(3)->format('Y-m-d'));
            $to   = $request->input('to', now()->addMonths(3)->format('Y-m-d'));

            $page = 1; $synced = 0; $errors = 0; $maxPages = 10;

            while ($page <= $maxPages) {
                $response = $smoobu->listReservations(['from' => $from, 'to' => $to, 'page' => $page, 'pageSize' => 100]);
                $bookings = $response['bookings'] ?? [];
                if (empty($bookings)) break;

                foreach ($bookings as $b) {
                    try {
                        // Use data from list response directly — no extra API call per booking
                        $service->upsertBookingFromData($b);
                        $synced++;
                    } catch (\Throwable $e) {
                        $errors++;
                        \Illuminate\Support\Facades\Log::warning('Sync reservation failed', ['id' => $b['id'] ?? null, 'error' => $e->getMessage()]);
                    }
                }

                if ($page >= ($response['page_count'] ?? 1)) break;
                $page++;
            }

            $msg = "Synced {$synced} reservations.";
            if ($errors) $msg .= " {$errors} failed.";

            // Log sync event for dashboard "Last Sync"
            try {
                AuditLog::create([
                    'organization_id' => app()->bound('current_organization_id') ? app('current_organization_id') : null,
                    'user_id'         => $request->user()?->id,
                    'action'          => 'booking.sync',
                    'description'     => "PMS sync: {$synced} synced, {$errors} failed",
                ]);
            } catch (\Throwable) {}

            return response()->json(['message' => $msg, 'synced' => $synced, 'errors' => $errors]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('PMS sync failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return response()->json([
                'message' => 'PMS sync failed: ' . $e->getMessage(),
                'synced' => 0,
                'error' => true,
            ], 200); // 200 so frontend can display the message
        }
    }

    /** GET /v1/admin/bookings/calendar — calendar view with full data. */
    public function calendar(Request $request): JsonResponse
    {
        $month = $request->input('month', now()->format('Y-m'));
        $start = Carbon::parse($month . '-01')->startOfMonth()->subDays(7);
        $end   = Carbon::parse($month . '-01')->endOfMonth()->addDays(7);

        $bookings = BookingMirror::where(function ($q) use ($start, $end) {
                $q->whereBetween('arrival_date', [$start, $end])
                  ->orWhereBetween('departure_date', [$start, $end])
                  ->orWhere(function ($q2) use ($start, $end) {
                      $q2->where('arrival_date', '<=', $start)
                         ->where('departure_date', '>=', $end);
                  });
            })
            ->where('booking_state', '!=', 'cancelled')
            ->get(['id', 'reservation_id', 'guest_name', 'apartment_id', 'apartment_name',
                   'arrival_date', 'departure_date', 'adults', 'children',
                   'internal_status', 'booking_state', 'payment_status', 'price_total', 'price_paid']);

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

    /** GET /v1/admin/bookings/payments — payment overview with computed fields. */
    public function payments(Request $request): JsonResponse
    {
        $query = BookingMirror::whereNotNull('price_total')
            ->orderByDesc('arrival_date');

        if ($status = $request->input('payment_status')) {
            if ($status === 'open') {
                $query->whereRaw('COALESCE(price_paid, 0) < price_total');
            } else {
                $query->where('payment_status', $status);
            }
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('guest_name', 'ilike', "%{$search}%")
                  ->orWhere('apartment_name', 'ilike', "%{$search}%")
                  ->orWhere('channel_name', 'ilike', "%{$search}%");
            });
        }

        if ($unitId = $request->input('unit_id')) {
            $query->where('apartment_id', $unitId);
        }

        $paginated = $query->paginate(25);

        $items = collect($paginated->items())->map(function ($b) {
            $arr = $b->toArray();
            $arr['balance_due'] = round(($b->price_total ?? 0) - ($b->price_paid ?? 0), 2);
            return $arr;
        });

        return response()->json([
            'data'         => $items,
            'current_page' => $paginated->currentPage(),
            'last_page'    => $paginated->lastPage(),
            'total'        => $paginated->total(),
        ]);
    }

    /** POST /v1/admin/bookings/sync-apartments — fetch apartments from Smoobu and save as booking_units. */
    public function syncApartments(SmoobuClient $smoobu): JsonResponse
    {
        try {
            $response = $smoobu->getApartments();
            $apartments = $response['apartments'] ?? [];

            if (empty($apartments)) {
                return response()->json(['message' => 'No apartments found in PMS.', 'count' => 0]);
            }

            // Transform Smoobu apartments into booking_units config format
            $units = [];
            foreach ($apartments as $apt) {
                $id = (string) ($apt['id'] ?? '');
                if (!$id) continue;

                $rooms = $apt['rooms'] ?? [];
                $units[$id] = [
                    'id'              => $id,
                    'name'            => $apt['name'] ?? "Unit {$id}",
                    'slug'            => \Illuminate\Support\Str::slug($apt['name'] ?? "unit-{$id}"),
                    'max_guests'      => $rooms['maxOccupancy'] ?? $apt['maxOccupancy'] ?? 4,
                    'bedrooms'        => $rooms['bedrooms'] ?? 1,
                    'price_per_night' => $apt['price'] ?? $apt['pricePerNight'] ?? 100,
                    'thumbnail'       => $apt['imageUrl'] ?? $apt['mainImage'] ?? '',
                    'description'     => $apt['description'] ?? '',
                ];
            }

            // Save to hotel_settings
            $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
            \App\Models\HotelSetting::withoutGlobalScopes()->updateOrCreate(
                ['key' => 'booking_units', 'organization_id' => $orgId],
                ['value' => json_encode($units), 'type' => 'json', 'group' => 'booking'],
            );

            // Clear availability caches
            \Illuminate\Support\Facades\Cache::flush();

            AuditLog::create([
                'organization_id' => $orgId,
                'user_id'         => request()->user()?->id,
                'action'          => 'booking.sync_apartments',
                'description'     => 'Synced ' . count($units) . ' apartments from PMS',
            ]);

            return response()->json(['message' => 'Synced ' . count($units) . ' apartments from PMS.', 'count' => count($units), 'units' => $units]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Apartment sync failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to sync apartments: ' . $e->getMessage(), 'count' => 0], 200);
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function paymentStateLabel(string $key): string
    {
        return match ($key) {
            'invoice_waiting' => 'Invoice waiting',
            'channel_managed' => 'Channel managed',
            default           => ucfirst(str_replace('_', ' ', $key)),
        };
    }
}
