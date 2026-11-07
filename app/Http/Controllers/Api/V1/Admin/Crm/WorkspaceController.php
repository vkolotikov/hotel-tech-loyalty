<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\ChatConversation;
use App\Models\ChatWidgetConfig;
use App\Models\Inquiry;
use App\Models\Organization;
use App\Models\Task;
use App\Services\AiUsageService;
use App\Services\Appointments\VenueClock;
use App\Services\Crm\CrmAccess;
use App\Services\Crm\CrmSetupProgress;
use App\Services\Crm\CrmToday;
use App\Services\Portal\PortalBootstrap;
use App\Support\OrgAccent;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech CRM's own reads (2026-11-07): what the workspace needs before it draws anything (bootstrap), Today, and the
 * setup steps. Everything else the workspace shows comes from the full admin's chat and CRM endpoints, whose rules
 * stay theirs (AccessMap). All behind `workspace:crm`; reads only.
 */
class WorkspaceController extends Controller
{
    public const NAME = 'HexaTech CRM';

    public function bootstrap(Request $request, AiUsageService $usage, CrmSetupProgress $setup): JsonResponse
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');
        $orgId = (int) $org->id;
        $user = $request->user();
        $zone = VenueClock::zone($orgId);
        $dayEnds = CarbonImmutable::now($zone)->endOfDay()->utc();
        $budget = $usage->budgetStatus($org);
        $widget = ChatWidgetConfig::query()->orderBy('id')->first(['id', 'widget_key', 'is_active']);
        $progress = $setup->for($orgId);
        $platform = method_exists($user, 'isPlatformAdmin') && $user->isPlatformAdmin();

        return response()->json([
            'name'         => self::NAME,
            'organization' => ['id' => $orgId, 'name' => (string) $org->name, 'industry' => (string) $org->resolved_industry],
            'accent'       => OrgAccent::of($orgId),
            'venue'        => [
                'timezone' => VenueClock::zone($orgId),
                'today'    => VenueClock::today($orgId),
                'currency' => PortalBootstrap::currency($org),
            ],
            // What the plan holds: the chatbot's setup and the knowledge base answer 402 `feature_locked` without
            // `chatbot`, the live visitor feed without `engagement` (routes/api.php).
            'features'     => [
                'chatbot'    => $platform || $org->hasFeature('chatbot'),
                'engagement' => $platform || $org->hasFeature('engagement'),
            ],
            // The month's AI allowance (the widget's assistant and the inbox's drafts spend it).
            'ai'           => ['status' => $budget['status'], 'percent' => $budget['percent']],
            'staff'        => [
                'id'   => (int) $user->id,
                'name' => (string) $user->name,
                'role' => CrmAccess::role($user),
                'can'  => CrmAccess::forBootstrap($user),
            ],
            'widget'       => $widget ? ['key' => (string) $widget->widget_key, 'active' => (bool) $widget->is_active] : null,
            'counts'       => [
                'chats_waiting' => ChatConversation::query()->where('status', 'waiting')->count(),
                'leads_new'     => Inquiry::query()->where('created_at', '>=', now()->subDay())->count(),
                'tasks_due'     => Task::query()->whereNull('completed_at')->where('assigned_to', $user->id)
                    ->whereNotNull('due_at')->where('due_at', '<=', $dayEnds)->count(),
            ],
            'setup'        => ['done' => $progress['done'], 'total' => $progress['total'], 'complete' => $progress['complete']],
        ]);
    }

    public function today(Request $request, CrmToday $today): JsonResponse
    {
        return response()->json($today->for((int) $request->attributes->get('workspace_org')->id, $request->user()));
    }

    public function start(Request $request, CrmSetupProgress $setup): JsonResponse
    {
        return response()->json($setup->for((int) $request->attributes->get('workspace_org')->id));
    }
}
