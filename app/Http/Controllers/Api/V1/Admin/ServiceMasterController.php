<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterSchedule;
use App\Models\ServiceMasterTimeOff;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceMasterController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            ServiceMaster::with(['services:id,name', 'schedules'])
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get()
        );
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(
            ServiceMaster::with(['services', 'schedules', 'timeOff' => function ($q) {
                $q->where('date', '>=', now()->subWeek()->toDateString())->orderBy('date');
            }])->findOrFail($id)
        );
    }

    public function store(Request $request): JsonResponse
    {
        foreach (['specialties', 'service_ids', 'schedules'] as $jsonField) {
            if ($request->has($jsonField) && is_string($request->input($jsonField))) {
                $decoded = json_decode($request->input($jsonField), true);
                if (is_array($decoded)) $request->merge([$jsonField => $decoded]);
            }
        }

        $data = $request->validate([
            'name'          => 'required|string|max:200',
            'title'         => 'nullable|string|max:200',
            'bio'           => 'nullable|string|max:2000',
            'email'         => 'nullable|email|max:255',
            'phone'         => 'nullable|string|max:40',
            'avatar'        => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'specialties'   => 'nullable|array',
            'sort_order'    => 'nullable|integer',
            'is_active'     => 'nullable|boolean',
            'service_ids'   => 'nullable|array',
            'service_ids.*' => 'integer|exists:services,id',
            'schedules'     => 'nullable|array',
            'schedules.*.day_of_week' => 'required_with:schedules|integer|min:0|max:6',
            'schedules.*.start_time'  => 'required_with:schedules|string',
            'schedules.*.end_time'    => 'required_with:schedules|string',
        ]);

        $serviceIds = $data['service_ids'] ?? [];
        $schedules = $data['schedules'] ?? [];
        unset($data['avatar'], $data['service_ids'], $data['schedules']);

        $data['organization_id'] = app('current_organization_id');

        if ($request->hasFile('avatar')) {
            $data['avatar'] = MediaService::upload($request->file('avatar'), 'service-masters');
        }

        $master = ServiceMaster::create($data);

        if (!empty($serviceIds)) {
            $sync = [];
            foreach ($serviceIds as $sid) {
                $sync[(int) $sid] = ['organization_id' => $data['organization_id']];
            }
            $master->services()->sync($sync);
        }

        if (!empty($schedules)) {
            $this->replaceSchedules($master, $schedules);
        }

        return response()->json($master->load(['services', 'schedules']), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $master = ServiceMaster::findOrFail($id);

        foreach (['specialties', 'service_ids', 'schedules'] as $jsonField) {
            if ($request->has($jsonField) && is_string($request->input($jsonField))) {
                $decoded = json_decode($request->input($jsonField), true);
                if (is_array($decoded)) $request->merge([$jsonField => $decoded]);
            }
        }

        $data = $request->validate([
            'name'          => 'nullable|string|max:200',
            'title'         => 'nullable|string|max:200',
            'bio'           => 'nullable|string|max:2000',
            'email'         => 'nullable|email|max:255',
            'phone'         => 'nullable|string|max:40',
            'avatar'        => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'specialties'   => 'nullable|array',
            'sort_order'    => 'nullable|integer',
            'is_active'     => 'nullable|boolean',
            'service_ids'   => 'nullable|array',
            'service_ids.*' => 'integer|exists:services,id',
            'schedules'     => 'nullable|array',
            'schedules.*.day_of_week' => 'required_with:schedules|integer|min:0|max:6',
            'schedules.*.start_time'  => 'required_with:schedules|string',
            'schedules.*.end_time'    => 'required_with:schedules|string',
        ]);

        $serviceIds = $data['service_ids'] ?? null;
        $schedules = $data['schedules'] ?? null;
        unset($data['avatar'], $data['service_ids'], $data['schedules']);

        if ($request->hasFile('avatar')) {
            $data['avatar'] = MediaService::upload($request->file('avatar'), 'service-masters');
        }

        $master->update($data);

        if ($serviceIds !== null) {
            $sync = [];
            $orgId = app('current_organization_id');
            foreach ($serviceIds as $sid) {
                $sync[(int) $sid] = ['organization_id' => $orgId];
            }
            $master->services()->sync($sync);
        }

        if ($schedules !== null) {
            $this->replaceSchedules($master, $schedules);
        }

        return response()->json($master->fresh(['services', 'schedules']));
    }

    public function destroy(int $id): JsonResponse
    {
        $master = ServiceMaster::findOrFail($id);
        $master->services()->detach();
        ServiceMasterSchedule::where('service_master_id', $master->id)->delete();
        ServiceMasterTimeOff::where('service_master_id', $master->id)->delete();
        $master->delete();
        return response()->json(['message' => 'Master deleted']);
    }

    /** POST /v1/admin/service-masters/{id}/time-off — add a time-off entry. */
    public function addTimeOff(Request $request, int $id): JsonResponse
    {
        $master = ServiceMaster::findOrFail($id);

        $data = $request->validate([
            'date'       => 'required|date',
            'start_time' => 'nullable|date_format:H:i',
            'end_time'   => 'nullable|date_format:H:i|after:start_time',
            'reason'     => 'nullable|string|max:200',
        ]);

        $data['organization_id'] = app('current_organization_id');
        $data['service_master_id'] = $master->id;

        $entry = ServiceMasterTimeOff::create($data);
        return response()->json($entry, 201);
    }

    /** DELETE /v1/admin/service-masters/{id}/time-off/{entryId} */
    public function removeTimeOff(int $id, int $entryId): JsonResponse
    {
        ServiceMasterTimeOff::where('service_master_id', $id)
            ->where('id', $entryId)
            ->delete();
        return response()->json(['message' => 'Time-off removed']);
    }

    private function replaceSchedules(ServiceMaster $master, array $schedules): void
    {
        ServiceMasterSchedule::where('service_master_id', $master->id)->delete();
        $orgId = app('current_organization_id');
        foreach ($schedules as $s) {
            ServiceMasterSchedule::create([
                'organization_id'   => $orgId,
                'service_master_id' => $master->id,
                'day_of_week'       => (int) $s['day_of_week'],
                'start_time'        => $s['start_time'],
                'end_time'          => $s['end_time'],
                'is_active'         => $s['is_active'] ?? true,
            ]);
        }
    }
}
