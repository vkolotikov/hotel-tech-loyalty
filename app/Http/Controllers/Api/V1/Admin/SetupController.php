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
     * Check if the current organization has been set up.
     */
    public function status(Request $request): JsonResponse
    {
        $orgId = app('current_organization_id');

        if (!$orgId) {
            return response()->json(['setup_complete' => false, 'reason' => 'no_organization']);
        }

        $hasTiers = LoyaltyTier::where('organization_id', $orgId)->exists();

        return response()->json([
            'setup_complete' => $hasTiers,
            'organization_id' => $orgId,
        ]);
    }

    /**
     * POST /v1/admin/setup/initialize
     * Initialize the organization with defaults + optional sample data.
     */
    public function initialize(Request $request): JsonResponse
    {
        $request->validate([
            'with_sample_data' => 'nullable|boolean',
            'hotel_name'       => 'nullable|string|max:255',
        ]);

        $orgId = app('current_organization_id');
        if (!$orgId) {
            return response()->json(['error' => 'No organization context'], 400);
        }

        $org = Organization::findOrFail($orgId);

        // Update org name if provided
        if ($request->filled('hotel_name')) {
            $org->update(['name' => $request->input('hotel_name')]);
        }

        try {
            // Set up defaults (tiers, benefits, settings) — idempotent
            $this->setup->setupDefaults($org);

            // Optionally seed sample data (wrapped in its own transaction)
            if ($request->boolean('with_sample_data')) {
                $this->setup->seedSampleData($org);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Setup initialize failed', [
                'org_id' => $org->id,
                'with_sample_data' => $request->boolean('with_sample_data'),
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
