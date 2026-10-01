<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\Setup\SetupPresenter;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\AppointmentImpact;
use App\Services\Booking\Setup\TeamSetup;
use App\Services\Booking\Setup\TimeOffSetup;
use App\Services\Booking\Setup\WeeklyHours;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Team members, their weekly hours and their time off, from the workspace.
 * Managers change everything; a staff user may add and remove time off for
 * the team member linked to their own sign-in. Saves that strand upcoming
 * appointments answer with them; `dry_run=1` answers with them only.
 */
class SetupTeamController extends Controller
{
    public function store(Request $request, TeamSetup $setup, SetupPresenter $present): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(TeamSetup::rules(true));
        $master = DB::transaction(fn () => $setup->create($data));

        return response()->json(['team_member' => $this->present($master, $present)], 201);
    }

    public function update(Request $request, int $id, TeamSetup $setup, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $master = $this->member($id);
        $data = $request->validate(TeamSetup::rules(false, $master));

        $stranded = AppointmentImpact::none();
        if (array_key_exists('is_active', $data) && !filter_var($data['is_active'], FILTER_VALIDATE_BOOL) && $master->is_active) {
            $stranded = $impact->forMaster($master);
        } elseif (array_key_exists('services', $data)) {
            $kept = array_map(fn (array $s) => (int) $s['id'], $data['services']);
            foreach ($master->services as $service) {
                if (!in_array((int) $service->id, $kept, true)) {
                    $stranded = AppointmentImpact::merge($stranded, $impact->forMasterService($master, (int) $service->id));
                }
            }
        }
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        $master = DB::transaction(fn () => $setup->update($master, $data));

        return response()->json(['team_member' => $this->present($master, $present)] + $stranded);
    }

    public function hours(Request $request, int $id, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $master = $this->member($id);
        $request->validate(['week' => 'present|array']);
        $week = WeeklyHours::normalise($request->input('week', []), 'week');

        $stranded = $impact->forWeek($master, $week);
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        DB::transaction(fn () => WeeklyHours::replace($master, $week));

        return response()->json(['team_member' => $this->present($master, $present)] + $stranded);
    }

    public function addTimeOff(Request $request, int $id, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        $master = $this->member($id);
        SetupAccess::requireTimeOffRight($request->user(), $master);
        $data = $request->validate(TimeOffSetup::rules());
        $rows = TimeOffSetup::plan($master, $data);

        $stranded = $impact->forTimeOff($master, $rows);
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        DB::transaction(fn () => TimeOffSetup::add($master, $rows, $data['reason'] ?? null));

        return response()->json(['team_member' => $this->present($master, $present)] + $stranded, 201);
    }

    public function removeTimeOff(Request $request, int $id, int $entryId, SetupPresenter $present): JsonResponse
    {
        $master = $this->member($id);
        SetupAccess::requireTimeOffRight($request->user(), $master);
        $deleted = ServiceMasterTimeOff::where('service_master_id', $master->id)->where('id', $entryId)->delete();
        if ($deleted === 0) {
            throw new AppointmentRefused('not_found', 'This time off no longer exists.', 404);
        }

        return response()->json(['team_member' => $this->present($master, $present)]);
    }

    private function member(int $id): ServiceMaster
    {
        return ServiceMaster::find($id) ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
    }

    private function present(ServiceMaster $master, SetupPresenter $present): array
    {
        $today = VenueClock::today((int) app('current_organization_id'));

        return $present->member($master->fresh(SetupPresenter::memberRelations($today)));
    }
}
