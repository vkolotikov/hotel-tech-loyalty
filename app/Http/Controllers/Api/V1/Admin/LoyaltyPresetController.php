<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\CrmSetting;
use App\Services\LoyaltyPresetService;
use App\Services\OrganizationSetupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Membership setup-wizard backend.
 *
 *   GET  /v1/admin/loyalty-presets        → list presets + which one is applied
 *   POST /v1/admin/loyalty-presets/apply  → apply one (+ optional sample data)
 *   POST /v1/admin/loyalty-presets/skip   → mark the wizard as skipped so it
 *                                           doesn't pop again on /members
 */
class LoyaltyPresetController extends Controller
{
    public function __construct(
        protected LoyaltyPresetService $svc,
        protected OrganizationSetupService $setup,
    ) {}

    public function index(): JsonResponse
    {
        $marker = optional(CrmSetting::where('key', 'members_onboarding_completed_at')->first())->value;
        return response()->json(array_merge(
            $this->svc->listPresets(),
            ['onboarding_completed_at' => $marker ? trim((string) $marker, '"') : null],
        ));
    }

    public function apply(Request $request): JsonResponse
    {
        $data = $request->validate([
            'preset'           => 'required|string',
            'with_sample_data' => 'nullable|boolean',
        ]);

        $orgId = app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'No organization context'], 400);
        }

        try {
            $summary = $this->svc->apply($data['preset'], (int) $orgId);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        // Optional sample data — same seedSampleData() that the
        // initial onboarding wizard uses, but the user might be
        // hitting this from the dedicated Members wizard and want
        // a few sample members to play with.
        if (!empty($data['with_sample_data'])) {
            $org = \App\Models\Organization::findOrFail($orgId);
            try {
                $this->setup->seedSampleData($org);
                $summary['sample_data_added'] = true;
            } catch (\Throwable $e) {
                $summary['sample_data_added'] = false;
                $summary['sample_data_error'] = $e->getMessage();
            }
        }

        // Stamp completion so the wizard skip-gate flips on.
        CrmSetting::updateOrCreate(
            ['key' => 'members_onboarding_completed_at'],
            ['value' => json_encode(now()->toIso8601String())],
        );

        // Phase 5 — medical no-op summary has tiers_set=0 + tiers_added=0
        // + benefits_added=0. The pre-Phase-5 message "Applied: 0 tiers
        // configured, 0 benefits added" reads as a silent failure, not
        // as the intentional decision #5 design ("no patient loyalty
        // program"). Branch on the noop flag for a clearer message.
        if (!empty($summary['noop'])) {
            $msg = "Medical industry has no loyalty program (no tiers or benefits added). You can still award points + send campaigns manually if needed.";
        } else {
            $msg = "Applied: {$summary['tiers_set']} tiers configured, {$summary['benefits_added']} benefits added";
            if (!$summary['replaced'] && $summary['members_on_tiers'] > 0) {
                $msg .= " ({$summary['members_on_tiers']} existing members preserved on their tiers)";
            }
        }

        return response()->json(['message' => $msg, 'summary' => $summary]);
    }

    /**
     * Mark the wizard as dismissed without applying a preset. The
     * user can re-open it from Settings → Loyalty (when we add that
     * surface) or by clearing the marker.
     */
    public function skip(Request $request): JsonResponse
    {
        CrmSetting::updateOrCreate(
            ['key' => 'members_onboarding_completed_at'],
            ['value' => json_encode(now()->toIso8601String())],
        );
        CrmSetting::updateOrCreate(
            ['key' => 'members_onboarding_skipped'],
            ['value' => 'true'],
        );
        return response()->json(['message' => 'Skipped — you can configure tiers manually anytime from Settings → Loyalty.']);
    }
}
