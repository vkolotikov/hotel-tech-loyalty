<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\VenueClock;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The calendar's read model. Working windows and free slots come from
 * ServiceSchedulingService — the workspace never computes availability.
 */
class CalendarController extends Controller
{
    private const MAX_DAYS = 31;

    /** Working windows cost two queries per person per day: none past a week, and none for a caller that sends `windows=0`. */
    private const WINDOW_DAYS = 7;

    public function calendar(Request $request, ServiceSchedulingService $scheduler, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'from'              => 'required|date_format:Y-m-d',
            'to'                => 'required|date_format:Y-m-d|after_or_equal:from',
            'master_id'         => 'nullable|integer',
            'include_cancelled' => 'nullable|boolean',
            // A caller that draws no grid (the list view) asks for none.
            'windows'           => 'nullable|boolean',
        ]);

        $from = CarbonImmutable::createFromFormat('!Y-m-d', $data['from'], 'UTC');
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $data['to'], 'UTC');
        $days = intdiv($to->getTimestamp() - $from->getTimestamp(), 86400) + 1;
        if ($days > self::MAX_DAYS) {
            throw new AppointmentRefused('range_too_long', 'Ask for at most 31 days at a time.', 422);
        }

        $masters = ServiceMaster::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();

        $withWindows = [];
        if ($days <= self::WINDOW_DAYS && $request->boolean('windows', true)) {
            $withWindows = !empty($data['master_id'])
                ? $masters->where('id', (int) $data['master_id'])->pluck('id')->all()
                : $masters->pluck('id')->all();
        }

        $timeOff = ServiceMasterTimeOff::whereIn('service_master_id', $withWindows)
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->orderBy('start_time')
            ->get()
            ->groupBy(fn (ServiceMasterTimeOff $o) => $o->service_master_id . '|' . $o->date->toDateString());

        $masterRows = $masters->map(function (ServiceMaster $m) use ($from, $to, $withWindows, $timeOff, $scheduler) {
            $perDay = [];
            if (in_array($m->id, $withWindows, true)) {
                for ($day = $from; $day->lte($to); $day = $day->addDay()) {
                    $key = $day->toDateString();
                    $perDay[$key] = [
                        // A window ending at 24:00 ends on the next day's 00:00 for the scheduler; the grid needs 24:00.
                        'windows'  => array_map(
                            fn (array $w) => [
                                'start' => $w['start']->format('H:i'),
                                'end'   => $w['end']->toDateString() === $day->toDateString() ? $w['end']->format('H:i') : '24:00',
                            ],
                            $scheduler->workingWindows($m, $day),
                        ),
                        'time_off' => ($timeOff[$m->id . '|' . $key] ?? collect())->map(fn (ServiceMasterTimeOff $o) => [
                            'start'  => $o->start_time ? substr((string) $o->start_time, 0, 5) : null,
                            'end'    => $o->end_time ? substr((string) $o->end_time, 0, 5) : null,
                            'reason' => $o->reason,
                        ])->values()->all(),
                    ];
                }
            }

            return [
                'id'     => (int) $m->id,
                'name'   => (string) $m->name,
                'title'  => $m->title,
                'avatar' => $m->avatar,
                // An object even when empty, so the client always reads a map.
                'days'   => (object) $perDay,
            ];
        })->values()->all();

        $activeMasterIds = $masters->pluck('id')->all();
        $services = Service::where('is_active', true)->with('masters')->orderBy('sort_order')->orderBy('name')->get()
            ->map(fn (Service $s) => [
                'id'                   => (int) $s->id,
                'name'                 => (string) $s->name,
                'duration_minutes'     => (int) $s->duration_minutes,
                'buffer_after_minutes' => (int) ($s->buffer_after_minutes ?? 0),
                'price'                => (float) $s->price,
                'currency'             => $s->currency ?: 'EUR',
                'master_ids'           => $s->masters->pluck('id')->intersect($activeMasterIds)->values()->all(),
            ])->values()->all();

        $appointments = ServiceBooking::with(['service', 'master'])
            ->where('start_at', '>=', $from->format('Y-m-d 00:00:00'))
            ->where('start_at', '<=', $to->format('Y-m-d 23:59:59'))
            ->when(!$request->boolean('include_cancelled'), fn ($q) => $q->where('status', '!=', 'cancelled'))
            ->orderBy('start_at')
            ->orderBy('id')
            ->get()
            ->map(fn (ServiceBooking $b) => $presenter->summary($b))
            ->all();

        return response()->json([
            'from'         => $data['from'],
            'to'           => $data['to'],
            'masters'      => $masterRows,
            'services'     => $services,
            'appointments' => $appointments,
        ]);
    }

    public function slots(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $data = $request->validate([
            'service_id' => 'required|integer',
            'master_id'  => 'required|integer',
            'date'       => 'required|date_format:Y-m-d',
            'ignore'     => 'nullable|integer',
        ]);

        $service = Service::where('is_active', true)->find($data['service_id'])
            ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $master = ServiceMaster::where('is_active', true)->find($data['master_id'])
            ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);

        $orgId = (int) app('current_organization_id');
        $today = VenueClock::today($orgId);
        $slots = [];

        if ($data['date'] >= $today) {
            // The scheduler drops starts earlier than "now + lead" on the
            // application clock. Staff may book from the start of the
            // venue's today (a walk-in already in the chair), so the lead is
            // the distance from now back to that moment — usually negative.
            $todayStart = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC');
            $lead = intdiv($todayStart->getTimestamp() - CarbonImmutable::now()->getTimestamp(), 60);

            $slots = array_map(
                fn (array $s) => ['start' => VenueClock::wall($s['start']), 'end' => VenueClock::wall($s['end']), 'label' => $s['time_label']],
                $scheduler->availableSlots($service, $data['date'], $master->id, null, $lead, $data['ignore'] ?? null),
            );
        }

        return response()->json([
            'slots'            => $slots,
            'duration_minutes' => $scheduler->effectiveDuration($service, $master),
            'price'            => $scheduler->effectivePrice($service, $master),
            'currency'         => $service->currency ?: 'EUR',
        ]);
    }
}
