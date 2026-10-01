<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Booking\Setup\SetupChecklist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The venue's booking settings from the workspace's Setup. Managers only. */
class SetupSettingsController extends Controller
{
    public function update(Request $request, BookingRules $rules, SetupChecklist $checklist): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        if (is_string($request->input('currency'))) {
            $request->merge(['currency' => strtoupper(trim($request->input('currency')))]);
        }
        $data = $request->validate(BookingRules::rules());
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');

        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true] + (isset($data['currency'])
                ? BookingRules::currencyImpact((int) $org->id, $data['currency'])
                : ['services' => 0, 'extras' => 0]));
        }
        $rules->write($org, $data);
        $org = $org->fresh();

        return response()->json([
            'settings'  => BookingRules::read($org),
            'checklist' => $checklist->for((int) $org->id, SetupController::brandId()),
        ]);
    }
}
