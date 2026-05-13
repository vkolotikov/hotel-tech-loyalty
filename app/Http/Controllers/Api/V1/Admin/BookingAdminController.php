<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\BookingNote;
use App\Models\BookingSubmission;
use App\Services\BookingEngineService;
use App\Services\BookingRefundService;
use App\Services\PmsResolver;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingAdminController extends Controller
{
    /**
     * GET /v1/admin/bookings/today — front-desk daily operations summary.
     *
     * Distinct from `dashboard` which reports on a period window (week/month/year):
     * this returns the *now* numbers reception cares about — who's arriving,
     * who's still in the building, who's leaving — plus a tomorrow preview so
     * staff can pre-stage rooms.
     */
    public function today(): JsonResponse
    {
        $today    = now()->toDateString();
        $tomorrow = now()->addDay()->toDateString();

        $live = fn () => BookingMirror::where('booking_state', '!=', 'cancelled');

        $arrivalsToday    = $live()->where('arrival_date', $today);
        $departuresToday  = $live()->where('departure_date', $today);
        $inHouse          = $live()->where('arrival_date', '<=', $today)->where('departure_date', '>', $today);
        $arrivalsTomorrow = $live()->where('arrival_date', $tomorrow);

        $cols = ['id', 'guest_name', 'apartment_name', 'adults', 'children',
                 'arrival_date', 'departure_date', 'internal_status',
                 'payment_status', 'price_total', 'price_paid'];

        return response()->json([
            'date' => $today,
            'arrivals_today'   => [
                'count'  => (clone $arrivalsToday)->count(),
                'guests' => (clone $arrivalsToday)->orderBy('check_in_time')->limit(25)->get($cols),
            ],
            'in_house' => [
                'count'  => (clone $inHouse)->count(),
                'guests' => (clone $inHouse)->orderBy('departure_date')->limit(25)->get($cols),
            ],
            'departures_today' => [
                'count'  => (clone $departuresToday)->count(),
                'guests' => (clone $departuresToday)->orderBy('check_out_time')->limit(25)->get($cols),
            ],
            'arrivals_tomorrow_count' => $arrivalsTomorrow->count(),
        ]);
    }

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

        // Pre-fix this method did `$all = $base->get()` and then ran 9
        // collection operations in PHP memory — for a year window on a
        // hotel with thousands of bookings that's the cause of the
        // "Bookings page has delays" complaint. Now we run targeted
        // DB-side aggregations: one SELECT for the KPI scalars, one
        // GROUP BY for payment mix, one for unit perf, one for channel
        // mix. About 5× faster on Postgres.
        $applyFilters = function ($q) use ($from, $unitId) {
            $q->where('created_at', '>=', $from);
            if ($unitId) $q->where('apartment_id', $unitId);
            return $q;
        };

        // ── KPI scalars in ONE SELECT ─────────────────────────────
        $kpiRow = $applyFilters(BookingMirror::query())
            ->selectRaw('
                COUNT(*) AS total,
                COALESCE(SUM(price_total), 0) AS revenue,
                COALESCE(SUM(price_paid), 0) AS paid,
                COUNT(*) FILTER (WHERE booking_state = ?) AS confirmed,
                COUNT(*) FILTER (WHERE booking_state = ?) AS cancelled,
                COUNT(*) FILTER (WHERE payment_status = ?) AS pending,
                AVG(EXTRACT(EPOCH FROM (departure_date::timestamp - arrival_date::timestamp)) / 86400)
                    FILTER (WHERE arrival_date IS NOT NULL AND departure_date IS NOT NULL) AS avg_stay
            ', ['confirmed', 'cancelled', 'pending'])
            ->first();

        $total     = (int) ($kpiRow->total ?? 0);
        $revenue   = (float) ($kpiRow->revenue ?? 0);
        $paid      = (float) ($kpiRow->paid ?? 0);
        $confirmed = (int) ($kpiRow->confirmed ?? 0);
        $cancelled = (int) ($kpiRow->cancelled ?? 0);
        $pending   = (int) ($kpiRow->pending ?? 0);
        $avgStay   = $kpiRow->avg_stay !== null ? (float) $kpiRow->avg_stay : null;

        // ── Payment mix — GROUP BY payment_status ────────────────
        $paymentMix = $applyFilters(BookingMirror::query())
            ->selectRaw("COALESCE(payment_status, 'unknown') AS key, COUNT(*) AS count, COALESCE(SUM(price_total), 0) AS total")
            ->groupBy('key')
            ->get()
            ->map(fn ($r) => [
                'label' => $this->paymentStateLabel($r->key),
                'key'   => $r->key,
                'count' => (int) $r->count,
                'total' => round((float) $r->total, 2),
            ])
            ->values();

        // ── Arrivals timeline — next 14 days. Already DB-aggregated. ──
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

        // ── Unit performance — GROUP BY apartment_name/id ────────
        $unitPerf = $applyFilters(BookingMirror::query())
            ->selectRaw('
                apartment_name,
                MAX(apartment_id) AS apartment_id,
                COUNT(*) AS bookings,
                COALESCE(SUM(price_total), 0) AS revenue,
                COALESCE(SUM(price_paid), 0) AS paid,
                AVG(EXTRACT(EPOCH FROM (departure_date::timestamp - arrival_date::timestamp)) / 86400)
                    FILTER (WHERE arrival_date IS NOT NULL AND departure_date IS NOT NULL) AS avg_nights
            ')
            ->whereNotNull('apartment_name')
            ->groupBy('apartment_name')
            ->get()
            ->map(fn ($r) => [
                'unit_name'  => $r->apartment_name,
                'unit_id'    => $r->apartment_id,
                'bookings'   => (int) $r->bookings,
                'revenue'    => round((float) $r->revenue, 2),
                'paid'       => round((float) $r->paid, 2),
                'balance'    => round((float) $r->revenue - (float) $r->paid, 2),
                'avg_nights' => $r->avg_nights !== null ? round((float) $r->avg_nights, 1) : 0.0,
            ])
            ->values();

        // ── Channel mix — GROUP BY channel_name ──────────────────
        $channelMix = $applyFilters(BookingMirror::query())
            ->selectRaw("COALESCE(channel_name, 'Direct') AS label, COUNT(*) AS count")
            ->groupBy('label')
            ->get()
            ->map(fn ($r) => ['label' => $r->label, 'count' => (int) $r->count])
            ->values();

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

    /**
     * POST /v1/admin/bookings/{id}/refund — refund a Stripe payment.
     *
     * Body: { amount?: float, reason?: string }
     *   - amount omitted → full refund of the captured payment
     *   - reason: one of duplicate / fraudulent / requested_by_customer
     *
     * All side effects (mirror update, loyalty reversal, Smoobu cancel,
     * guest email, audit log) are delegated to BookingRefundService so
     * the admin path and the Stripe webhook path stay in sync.
     */
    public function refund(Request $request, int $id, BookingRefundService $refund): JsonResponse
    {
        $booking = BookingMirror::findOrFail($id);

        $validated = $request->validate([
            'amount' => 'nullable|numeric|min:0.01',
            'reason' => 'nullable|in:duplicate,fraudulent,requested_by_customer',
        ]);

        try {
            $outcome = $refund->applyRefund(
                $booking,
                $validated['amount'] ?? null,
                $validated['reason'] ?? null,
                null,
                true,
                $request->user(),
            );
        } catch (\RuntimeException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Stripe refund failed: ' . $e->getMessage(),
            ], 502);
        }

        // Return the updated booking row PLUS the side-effect summary so
        // the admin UI can surface "points reversed: N" / "PMS cancelled: yes/no" /
        // "email sent: yes/no" as a toast.
        $response = $this->show($id);
        $payload  = json_decode($response->getContent(), true) ?? [];
        $payload['refund_outcome'] = $outcome;
        return response()->json($payload);
    }

    /** PATCH /v1/admin/bookings/{id}/status — update internal status / invoice / payment. */
    /**
     * Legal payment_status transitions. Anything not listed for a current
     * state is rejected with 422 so staff can't accidentally flip a paid
     * booking back to "pending" and lose the audit trail.
     *
     * `paid` and `refunded` are terminal-ish — only narrow forward-paths
     * out of them. `disputed` can resolve either way. Manual states like
     * `invoice_waiting` and `channel_managed` keep flexibility for staff
     * workflows that bypass the digital payment path.
     */
    private const PAYMENT_STATUS_TRANSITIONS = [
        'open'                => ['pending', 'paid', 'invoice_waiting', 'channel_managed'],
        'pending'             => ['paid', 'open', 'invoice_waiting', 'channel_managed'],
        'paid'                => ['partially_refunded', 'refunded', 'disputed'],
        'partially_refunded'  => ['refunded', 'paid', 'disputed'],
        'refunded'            => [],  // terminal — only restored via webhook on dispute-won
        'disputed'            => ['paid', 'refunded', 'partially_refunded'],
        'invoice_waiting'     => ['paid', 'open', 'channel_managed'],
        'channel_managed'     => ['paid', 'open', 'pending'],
    ];

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'internal_status' => 'nullable|string|max:40',
            'invoice_state'   => 'nullable|string|max:40',
            'payment_status'  => 'nullable|string|max:40',
            'price_paid'      => 'nullable|numeric|min:0',
        ]);

        // State-machine guard on payment_status — see PAYMENT_STATUS_TRANSITIONS.
        // Returns 422 with a clear message rather than silently allowing
        // illegal transitions that strand bookings in inconsistent state.
        if (array_key_exists('payment_status', $validated) && $validated['payment_status'] !== null) {
            $existing = BookingMirror::findOrFail($id);
            $current = $existing->payment_status ?: 'open';
            $next    = $validated['payment_status'];

            if ($current !== $next) {
                $allowed = self::PAYMENT_STATUS_TRANSITIONS[$current] ?? null;
                if ($allowed === null) {
                    return response()->json([
                        'error' => "Unknown current payment_status '{$current}'. Cannot transition.",
                    ], 422);
                }
                if (!in_array($next, $allowed, true)) {
                    return response()->json([
                        'error'   => "Cannot move payment_status from '{$current}' to '{$next}'.",
                        'allowed' => $allowed,
                        'hint'    => $current === 'refunded'
                            ? 'Refunded is terminal — issue a new charge if you need to restore.'
                            : ($current === 'paid' && $next === 'pending'
                                ? 'A paid booking cannot become pending. Use the Refund button to reverse the charge.'
                                : null),
                    ], 422);
                }
            }
        }

        // Row-lock so concurrent status/payment edits serialize instead of
        // racing (e.g. one operator marks paid while another changes status).
        DB::transaction(function () use ($id, $validated) {
            $booking = BookingMirror::lockForUpdate()->findOrFail($id);
            $booking->update(array_filter($validated, fn ($v) => $v !== null));
        });

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

        // Refresh apartments first so any newly-added units in Smoobu are
        // tracked before we start ingesting bookings against them.
        // Surface failures rather than silently swallowing them — staff
        // need to know if their unit list is stale.
        $apartmentWarning = null;
        try {
            $this->syncApartments($smoobu);
        } catch (\Throwable $e) {
            $apartmentWarning = "Apartment refresh failed: {$e->getMessage()}";
            \Illuminate\Support\Facades\Log::error('Apartment sync failed during full sync', ['error' => $e->getMessage()]);
        }

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
            $result = $service->syncReservationsFromPms(
                $request->input('from'),
                $request->input('to'),
            );

            $synced = $result['synced'];
            $errors = $result['errors'];

            $msg = "Synced {$synced} reservations.";
            if ($errors)            $msg .= " {$errors} failed.";
            if ($apartmentWarning)  $msg .= " ({$apartmentWarning})";

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
            ->get(['id', 'reservation_id', 'booking_type', 'guest_name', 'apartment_id', 'apartment_name',
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

    /**
     * POST /v1/admin/bookings/bulk — apply one action to many reservations.
     *
     * Supports cancel, mark_paid (sets price_paid = price_total per row),
     * mark_status, mark_payment_status. Each is row-locked so concurrent
     * single-row edits from BookingDetail don't race the bulk update.
     * Logged to AuditLog so the action shows up in the sync history /
     * audit trail like manual edits do.
     */
    public function bulk(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'     => 'required|array|min:1|max:500',
            'ids.*'   => 'integer',
            'action'  => 'required|string|in:cancel,mark_paid,mark_status,mark_payment_status',
            'value'   => 'nullable|string|max:40',
        ]);

        $rows = BookingMirror::whereIn('id', $validated['ids'])->get();
        if ($rows->isEmpty()) return response()->json(['updated' => 0, 'message' => 'No matching bookings.']);

        $updated = 0;
        DB::transaction(function () use ($rows, $validated, &$updated) {
            foreach ($rows as $b) {
                $patch = match ($validated['action']) {
                    'cancel'              => ['booking_state' => 'cancelled', 'internal_status' => 'cancelled'],
                    'mark_paid'           => ['payment_status' => 'paid', 'price_paid' => $b->price_total],
                    'mark_status'         => ['internal_status' => $validated['value'] ?? $b->internal_status],
                    'mark_payment_status' => ['payment_status'  => $validated['value'] ?? $b->payment_status],
                };
                BookingMirror::where('id', $b->id)->lockForUpdate()->update($patch);
                $updated++;
            }
        });

        try {
            AuditLog::create([
                'organization_id' => app()->bound('current_organization_id') ? app('current_organization_id') : null,
                'user_id'         => $request->user()?->id,
                'action'          => "booking.bulk.{$validated['action']}",
                'description'     => "Bulk {$validated['action']}: {$updated} reservations" . (isset($validated['value']) ? " → {$validated['value']}" : ''),
            ]);
        } catch (\Throwable) {}

        return response()->json([
            'updated' => $updated,
            'message' => "{$updated} reservation" . ($updated === 1 ? '' : 's') . ' updated.',
        ]);
    }

    /**
     * POST /v1/admin/bookings/export — CSV download of selected reservations
     * (or the full filtered list if `ids` is empty). Streamed so the response
     * starts flushing immediately on long exports.
     */
    public function export(Request $request)
    {
        $validated = $request->validate([
            'ids'           => 'nullable|array',
            'ids.*'         => 'integer',
            'search'        => 'nullable|string',
            'status'        => 'nullable|string',
            'payment_status' => 'nullable|string',
            'unit_id'       => 'nullable|string',
            'from'          => 'nullable|date',
            'to'            => 'nullable|date',
        ]);

        $q = BookingMirror::orderByDesc('arrival_date');

        if (!empty($validated['ids'])) {
            $q->whereIn('id', $validated['ids']);
        } else {
            // Mirror the same filter shape as index() so "Export all"
            // returns exactly what the UI is currently showing.
            if ($s = $validated['search'] ?? null) {
                $q->where(fn ($w) => $w
                    ->where('guest_name', 'ilike', "%{$s}%")
                    ->orWhere('guest_email', 'ilike', "%{$s}%")
                    ->orWhere('booking_reference', 'ilike', "%{$s}%"));
            }
            if ($v = $validated['status'] ?? null)         $q->where('internal_status', $v);
            if ($v = $validated['payment_status'] ?? null) $q->where('payment_status', $v);
            if ($v = $validated['unit_id'] ?? null)        $q->where('apartment_id', $v);
            if ($v = $validated['from'] ?? null)           $q->where('arrival_date', '>=', $v);
            if ($v = $validated['to'] ?? null)             $q->where('arrival_date', '<=', $v);
        }

        $headers = ['Reference', 'Guest', 'Email', 'Phone', 'Unit', 'Channel',
                    'Arrival', 'Departure', 'Nights', 'Adults', 'Children',
                    'Total', 'Paid', 'Balance', 'Status', 'Payment'];

        $filename = 'reservations-' . now()->format('Ymd-His') . '.csv';

        return response()->streamDownload(function () use ($q, $headers) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $headers);
            // Chunk so a 10k-row export doesn't spike memory
            $q->chunk(500, function ($chunk) use ($out) {
                foreach ($chunk as $b) {
                    $nights = ($b->arrival_date && $b->departure_date)
                        ? max(1, Carbon::parse($b->arrival_date)->diffInDays(Carbon::parse($b->departure_date))) : '';
                    fputcsv($out, [
                        $b->booking_reference, $b->guest_name, $b->guest_email, $b->guest_phone,
                        $b->apartment_name, $b->channel_name,
                        $b->arrival_date, $b->departure_date, $nights,
                        $b->adults, $b->children,
                        $b->price_total, $b->price_paid,
                        round(($b->price_total ?? 0) - ($b->price_paid ?? 0), 2),
                        $b->internal_status, $b->payment_status,
                    ]);
                }
            });
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * POST /v1/admin/bookings/manual — create a direct booking from the
     * timeline (walk-in, phone reservation, friends-and-family).
     *
     * Tagged booking_type='manual' so the move endpoint can distinguish it
     * from PMS-mirrored rows (which must be edited in the source PMS to
     * round-trip cleanly). reservation_id is a synthetic 'manual-...' id
     * so the unique-with-org constraint is satisfied without colliding
     * with any PMS sequence.
     *
     * Conflict check: refuses if an overlapping non-cancelled booking
     * exists in the same room. Pass `force=true` to override (used when
     * staff intentionally double-book — e.g. shared sauna slot).
     */
    public function manualCreate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'guest_name'     => 'required|string|max:180',
            'guest_email'    => 'nullable|email|max:180',
            'guest_phone'    => 'nullable|string|max:40',
            'apartment_id'   => 'required|string|max:20',
            'apartment_name' => 'nullable|string|max:180',
            'arrival_date'   => 'required|date',
            'departure_date' => 'required|date|after:arrival_date',
            'adults'         => 'nullable|integer|min:1|max:50',
            'children'       => 'nullable|integer|min:0|max:50',
            'price_total'    => 'nullable|numeric|min:0',
            'notice'         => 'nullable|string|max:2000',
            'force'          => 'nullable|boolean',
        ]);

        $conflict = BookingMirror::where('apartment_id', $data['apartment_id'])
            ->where('booking_state', '!=', 'cancelled')
            ->where('arrival_date', '<', $data['departure_date'])
            ->where('departure_date', '>', $data['arrival_date'])
            ->exists();
        if ($conflict && empty($data['force'])) {
            return response()->json([
                'conflict' => true,
                'message'  => 'Another booking overlaps these dates in this room. Resubmit with force=true to create anyway.',
            ], 409);
        }

        $reservation_id = 'manual-' . \Illuminate\Support\Str::random(16);

        $booking = BookingMirror::create([
            'reservation_id'    => $reservation_id,
            'booking_reference' => $reservation_id,
            'booking_type'      => 'manual',
            'booking_state'     => 'confirmed',
            'apartment_id'      => $data['apartment_id'],
            'apartment_name'    => $data['apartment_name'] ?? null,
            'channel_name'      => 'Direct',
            'guest_name'        => $data['guest_name'],
            'guest_email'       => $data['guest_email'] ?? null,
            'guest_phone'       => $data['guest_phone'] ?? null,
            'arrival_date'      => $data['arrival_date'],
            'departure_date'    => $data['departure_date'],
            'adults'            => $data['adults']   ?? 1,
            'children'          => $data['children'] ?? 0,
            'price_total'       => $data['price_total'] ?? null,
            'price_paid'        => 0,
            'payment_status'    => 'open',
            'internal_status'   => 'new',
            'notice'            => $data['notice'] ?? null,
            'source_created_at' => now(),
        ]);

        try {
            AuditLog::create([
                'organization_id' => app()->bound('current_organization_id') ? app('current_organization_id') : null,
                'user_id'         => $request->user()?->id,
                'action'          => 'booking.manual_create',
                'description'     => "Manual booking: {$data['guest_name']} · {$data['arrival_date']} → {$data['departure_date']} · " . ($data['apartment_name'] ?? $data['apartment_id']),
            ]);
        } catch (\Throwable) {}

        return response()->json($booking, 201);
    }

    /**
     * PATCH /v1/admin/bookings/{id}/move — change dates and/or room from the
     * timeline. Restricted to manual bookings; PMS-synced rows are read-only
     * here since edits would silently diverge from the source PMS.
     */
    public function move(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'arrival_date'   => 'required|date',
            'departure_date' => 'required|date|after:arrival_date',
            'apartment_id'   => 'nullable|string|max:20',
            'apartment_name' => 'nullable|string|max:180',
            'force'          => 'nullable|boolean',
        ]);

        $booking = BookingMirror::lockForUpdate()->findOrFail($id);

        if ($booking->booking_type !== 'manual') {
            return response()->json([
                'message' => 'Only manual bookings can be moved from the timeline. PMS-synced bookings must be edited in your PMS to keep the two systems in sync.',
            ], 422);
        }

        $apartmentId = $data['apartment_id'] ?? $booking->apartment_id;

        $conflict = BookingMirror::where('id', '!=', $id)
            ->where('apartment_id', $apartmentId)
            ->where('booking_state', '!=', 'cancelled')
            ->where('arrival_date', '<', $data['departure_date'])
            ->where('departure_date', '>', $data['arrival_date'])
            ->exists();
        if ($conflict && empty($data['force'])) {
            return response()->json([
                'conflict' => true,
                'message'  => 'Move would overlap another booking in this room. Resubmit with force=true to override.',
            ], 409);
        }

        $booking->update([
            'arrival_date'   => $data['arrival_date'],
            'departure_date' => $data['departure_date'],
            'apartment_id'   => $apartmentId,
            'apartment_name' => $data['apartment_name'] ?? $booking->apartment_name,
        ]);

        return response()->json($booking->fresh());
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
