<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Services\OrganizationSetupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SetupController extends Controller
{
    public function __construct(protected OrganizationSetupService $setup) {}

    /**
     * GET /v1/admin/setup/status
     * Check if the current organization has been set up. Combines two
     * signals so a re-run from Settings can always re-open the wizard:
     *   - `setup_complete`: has the org been initialised at all?
     *     Used by App.tsx to decide whether to gate the rest of the
     *     SPA behind the wizard.
     *   - `onboarding_completed_at`: timestamp from the new orchestrator
     *     so the wizard knows whether to pre-fill from previous answers.
     */
    public function status(Request $request): JsonResponse
    {
        $orgId = app('current_organization_id');

        if (!$orgId) {
            return response()->json(['setup_complete' => false, 'reason' => 'no_organization']);
        }

        $hasTiers = LoyaltyTier::where('organization_id', $orgId)->exists();
        $onboarded = \App\Models\CrmSetting::where('key', 'onboarding_completed_at')->first();

        return response()->json([
            'setup_complete'           => $hasTiers,
            'organization_id'          => $orgId,
            'onboarding_completed_at'  => $onboarded ? trim((string) $onboarded->value, '"') : null,
        ]);
    }

    /**
     * POST /v1/admin/setup/initialize
     * Initialize the organization with the wizard's full payload, or
     * (legacy path) just hotel_name + with_sample_data when called from
     * an older client.
     *
     * The richer shape goes through OrganizationSetupService::
     * onboardWithIndustry which orchestrates industry presets +
     * planner presets + nav visibility + property seed + chatbot.
     * The old shape stays supported so any in-flight client during
     * the rollout doesn't break.
     */
    public function initialize(Request $request): JsonResponse
    {
        $request->validate([
            // Legacy fields (still accepted)
            'hotel_name'       => 'nullable|string|max:255',
            'with_sample_data' => 'nullable|boolean',

            // New wizard payload
            'company_name'     => 'nullable|string|max:255',
            'industry'         => 'nullable|string|in:hotel,beauty,medical,legal,real_estate,education,fitness,restaurant',
            'phone'            => 'nullable|string|max:50',
            'country'          => 'nullable|string|max:80',
            'features'         => 'nullable|array',
            'features.*'       => 'string|in:ai_chat,loyalty,bookings,crm,operations',
            'property_count'   => 'nullable|integer|min:1|max:20',
            'welcome_message'  => 'nullable|string|max:500',
        ]);

        $orgId = app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'No organization context'], 400);
        }

        $org = Organization::findOrFail($orgId);

        // Pick branch: if the new fields are present, run the full
        // orchestrator. Otherwise fall back to the legacy two-step.
        $hasWizardPayload = $request->filled('industry') || $request->filled('features') || $request->filled('company_name');

        try {
            if ($hasWizardPayload) {
                $payload = $request->only([
                    'company_name', 'industry', 'phone', 'country',
                    'features', 'property_count', 'welcome_message', 'with_sample_data',
                ]);
                // Legacy alias — wizard ships "company_name" but
                // some integration tests use the older "hotel_name".
                if (!isset($payload['company_name']) && $request->filled('hotel_name')) {
                    $payload['company_name'] = $request->input('hotel_name');
                }
                $result = $this->setup->onboardWithIndustry($org, $payload);

                return response()->json([
                    'message' => 'Organization onboarded',
                    'organization' => $org->fresh(),
                    'result' => $result,
                ]);
            }

            // ── Legacy path ───────────────────────────────────────
            if ($request->filled('hotel_name')) {
                $org->update(['name' => $request->input('hotel_name')]);
            }
            $this->setup->setupDefaults($org);
            if ($request->boolean('with_sample_data')) {
                $this->setup->seedSampleData($org);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Setup initialize failed', [
                'org_id' => $org->id,
                'wizard' => $hasWizardPayload,
                'error'  => $e->getMessage(),
                'file'   => $e->getFile() . ':' . $e->getLine(),
            ]);
            return response()->json([
                'error'   => 'Setup failed: ' . $e->getMessage(),
                'details' => $e->getFile() . ':' . $e->getLine(),
            ], 500);
        }

        return response()->json([
            'message' => 'Organization initialized successfully',
            'organization' => $org->fresh(),
        ]);
    }
}
