<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\AiUsageService;
use App\Services\Appointments\VenueClock;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRules;
use App\Services\ContentKnowledgeService;
use App\Support\OrgAccent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** What HexaTech Content needs before it can draw anything (spec 2026-10-14 §6.4). */
class BootstrapController extends Controller
{
    public const NAME = 'HexaTech Content';

    public function show(Request $request, ContentKnowledgeService $knowledge, AiUsageService $usage): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        // Tenant-scoped: a user with staff rows in two organisations reports this one's role.
        $staff = Staff::where('user_id', $user->id)->first();
        $brands = ContentContext::brandsFor($user);
        $brandId = ContentContext::brandId();
        $brand = $brands->firstWhere('id', $brandId) ?? Brand::find($brandId);
        $profile = ContentContext::profile();
        $budget = $usage->budgetStatus($org);

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            // Each brand's logo for the top bar's brand chip (spec 2026-10-21 §9); null where it has none.
            'brand'        => $brand ? ['id' => (int) $brand->id, 'name' => (string) $brand->name, 'logo_url' => $brand->logo_url ?: null] : null,
            'brands'       => $brands->map(fn (Brand $b) => ['id' => (int) $b->id, 'name' => (string) $b->name, 'logo_url' => $b->logo_url ?: null])->values(),
            'accent'       => OrgAccent::of($orgId),
            'venue'        => [
                'timezone'       => VenueClock::zone($orgId),
                'timezone_named' => VenueClock::isNamed($orgId),
                'today'          => VenueClock::today($orgId),
            ],
            'staff'        => [
                // Plan 5A-2: the portal knows the person's own posts by it (spec 2026-10-19 §4.4).
                'id'            => (int) $user->id,
                'name'          => (string) $user->name,
                'role'          => $staff?->role,
                'can_manage'    => ContentAccess::canManage($user),
                // Spec 2026-10-19 §4.5: the switch in Content's menu.
                'morning_email' => (bool) ($user->wants_content_morning_email ?? false),
            ],
            'profile'      => $profile ? [
                'id'              => (int) $profile->id,
                'setup_completed' => $profile->setup_completed_at !== null,
                'readiness'       => (int) $knowledge->readinessOf($profile)['overall'],
                // Spec 2026-10-16 §6: the portal hides what staff may not do while approvals are on.
                'requires_approval' => (bool) ($profile->requires_approval ?? false),
            ] : null,
            'ai'           => ['status' => $budget['status'], 'percent' => $budget['percent']],
            'platforms'    => ContentRules::PLATFORMS,
            'statuses'     => ContentRules::STATUSES,
            'rewrites'     => ContentRules::REWRITES,
        ]);
    }
}
