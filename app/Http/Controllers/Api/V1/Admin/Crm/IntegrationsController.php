<?php

namespace App\Http\Controllers\Api\V1\Admin\Crm;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\AiUsageService;
use App\Services\Appointments\VenueClock;
use App\Services\Crm\IntakeTokens;
use App\Services\Mail\SenderSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * HexaTech CRM's Integrations page (round 5, 2026-11-12): what the full admin keeps behind its own product `admin`, made
 * reachable for an organisation that bought CRM alone, each limited to what the CRM needs and each on the full admin's
 * own service code. All behind `workspace:crm`; who may call each is AccessMap's (`admin/crm/intake-tokens`,
 * `admin/crm/mail-settings`, `admin/crm/ai-usage`).
 *
 * - API tokens for the lead intake only (IntakeTokens): list, create (the plain token answered once), revoke.
 * - The sender identity of the emails the CRM sends (SenderSettings: `mail_from_name`, `mail_reply_to`).
 * - The month's AI spend against the plan's allowance (AiUsageService), by feature and by the venue's day.
 */
class IntegrationsController extends Controller
{
    /** GET crm/intake-tokens: the caller's lead-intake tokens (never a token itself). */
    public function tokens(Request $request): JsonResponse
    {
        return $this->private(['data' => IntakeTokens::of($request->user()), 'limit' => IntakeTokens::LIMIT]);
    }

    /** POST crm/intake-tokens {label}: a new lead-intake token, the plain token answered this once. */
    public function createToken(Request $request): JsonResponse
    {
        $data = $request->validate(['label' => IntakeTokens::LABEL_RULE]);
        $made = IntakeTokens::create($request->user(), trim($data['label']));
        if (isset($made['refused'])) {
            return response()->json(['error' => $made['refused']], 422);
        }

        return $this->private($made['row'] + ['token' => $made['token']], 201);
    }

    /** DELETE crm/intake-tokens/{id}: revoke one of the caller's own lead-intake tokens at once. */
    public function revokeToken(Request $request, int $id): JsonResponse
    {
        if (!IntakeTokens::revoke($request->user(), $id)) {
            return response()->json(['error' => 'not_found'], 404);
        }

        return $this->private(['revoked' => true]);
    }

    /** GET crm/mail-settings: the sender name and reply-to, their defaults, what an email carries now, who may change it. */
    public function mailSettings(Request $request, SenderSettings $sender): JsonResponse
    {
        return $this->private($sender->read($this->org($request)) + ['can_change' => SenderSettings::mayChange($request->user())]);
    }

    /** PUT crm/mail-settings {from_name, reply_to}: an owner's change (the full admin's rule), audited. */
    public function updateMailSettings(Request $request, SenderSettings $sender): JsonResponse
    {
        if (!SenderSettings::mayChange($request->user())) {
            return response()->json(['error' => 'owner_only', 'message' => 'Only an owner can change integration settings.'], 403);
        }
        $data = $request->validate([
            'from_name' => ['present', 'nullable', 'string', 'max:' . SenderSettings::NAME_MAX, 'not_regex:/[\r\n<>"]/'],
            'reply_to'  => ['present', 'nullable', 'string', 'max:191', 'email:rfc'],
        ]);
        $org = $this->org($request);
        $sender->save($org, $request->user(), ['from_name' => $data['from_name'] ?? null, 'reply_to' => $data['reply_to'] ?? null]);

        return $this->private($sender->read($org) + ['can_change' => true]);
    }

    /**
     * GET crm/ai-usage: this month's AI spend (the organisation's one allowance, which the website assistant, the inbox's
     * drafts and every other AI feature spend) by feature and by the venue's day, against the plan's allowance.
     */
    public function aiUsage(Request $request, AiUsageService $usage): JsonResponse
    {
        $org = $this->org($request);
        $orgId = (int) $org->id;
        $breakdown = $usage->monthlyBreakdown($orgId);
        $modules = $org->planModules();

        return $this->private([
            'month'      => now()->format('Y-m'),
            'today'      => VenueClock::today($orgId),
            'budget'     => $usage->budgetStatus($org),
            'plan'       => ['modules' => $modules, 'tiers' => $modules === null ? null : (object) $org->planTiers()],
            'by_feature' => $breakdown['by_feature'],
            'by_day'     => $usage->monthByVenueDay($orgId, VenueClock::zone($orgId)),
            'calls'      => array_sum(array_column($breakdown['by_feature'], 'calls')),
        ]);
    }

    private function org(Request $request): Organization
    {
        /** @var Organization $org */
        $org = $request->attributes->get('workspace_org');

        return $org;
    }

    /** @param array<string, mixed> $data */
    private function private(array $data, int $status = 200): JsonResponse
    {
        return response()->json($data, $status)->header('Cache-Control', 'private, no-store');
    }
}
