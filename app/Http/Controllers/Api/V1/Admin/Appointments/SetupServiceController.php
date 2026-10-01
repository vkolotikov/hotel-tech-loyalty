<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\Setup\SetupPresenter;
use App\Services\Booking\Setup\AppointmentImpact;
use App\Services\Booking\Setup\ServiceSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Services and categories from the workspace's Setup. Managers only. A
 * change that strands upcoming appointments answers with them; `dry_run=1`
 * answers with them and saves nothing (owner decision: warn, list, allow).
 */
class SetupServiceController extends Controller
{
    public function store(Request $request, ServiceSetup $setup, SetupPresenter $present): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(ServiceSetup::rules(true));
        $service = DB::transaction(fn () => $setup->create($data));

        return response()->json(['service' => $present->service($service->load('masters'))], 201);
    }

    public function update(Request $request, int $id, ServiceSetup $setup, SetupPresenter $present, AppointmentImpact $impact): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $service = Service::find($id) ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $data = $request->validate(ServiceSetup::rules(false));

        $stranded = $this->stranded($service, $data, $impact);
        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + $stranded);
        }
        $service = DB::transaction(fn () => $setup->update($service, $data));

        return response()->json(['service' => $present->service($service->load('masters'))] + $stranded);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(['name' => 'required|string|max:120']);
        $orgId = (int) app('current_organization_id');
        $category = ServiceCategory::create([
            'name'       => $data['name'],
            'slug'       => Str::slug($data['name']),
            'is_active'  => true,
            'sort_order' => (int) ServiceCategory::withoutGlobalScopes()->where('organization_id', $orgId)->max('sort_order') + 1,
        ]);

        return response()->json(['category' => ['id' => (int) $category->id, 'name' => (string) $category->name]], 201);
    }

    /** Deactivating strands all its upcoming appointments; otherwise, those of each person taken off it. */
    private function stranded(Service $service, array $data, AppointmentImpact $impact): array
    {
        if (array_key_exists('is_active', $data) && !filter_var($data['is_active'], FILTER_VALIDATE_BOOL) && $service->is_active) {
            return $impact->forService($service);
        }
        $stranded = AppointmentImpact::none();
        if (array_key_exists('performers', $data)) {
            $kept = array_map(fn (array $p) => (int) $p['id'], $data['performers']);
            foreach ($service->masters as $master) {
                if (!in_array((int) $master->id, $kept, true)) {
                    $stranded = AppointmentImpact::merge($stranded, $impact->forMasterService($master, (int) $service->id));
                }
            }
        }

        return $stranded;
    }
}
