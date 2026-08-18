<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Chatbot\ChatbotOnboardingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * First-run chatbot setup.
 *
 * Registered inside the `feature:chatbot` group on purpose. The gate is
 * inconsistent across this module — widget-config, training and analytics are
 * ungated while behaviour, knowledge and popup-rules are not — so a wizard that
 * wrote across both sets would half-succeed on a Starter plan and 402 partway,
 * leaving a venue with some settings applied and no way to tell which. Gating
 * the whole flow means a Starter org sees the upgrade prompt the SPA already
 * renders for /chatbot-setup, rather than a wizard that breaks in the middle.
 */
class ChatbotOnboardingController extends Controller
{
    public function __construct(private readonly ChatbotOnboardingService $onboarding) {}

    /** What to render, and whether to render it at all. */
    public function show(Request $request): JsonResponse
    {
        return response()->json(
            $this->onboarding->state($request->user()->organization_id)
        );
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'company_name'   => 'nullable|string|max:150',
            'assistant_name' => 'nullable|string|max:120',
            // Mirrors ChatbotConfigController::updateBehavior so the wizard
            // cannot write a value the settings screen would reject.
            'tone'           => 'nullable|in:professional,friendly,casual,formal',
            'language'       => 'nullable|string|max:10',
            'timezone'       => 'nullable|string|max:64',
            'handoff_email'  => 'nullable|email|max:190',

            // Free-text venue facts. Bounded because they are rendered into
            // knowledge base answers that the assistant quotes verbatim.
            'facts'          => 'nullable|array',
            'facts.*'        => 'nullable|string|max:500',

            // The rules the admin left ticked. The service intersects these
            // against the preset's own list, so an unknown string cannot reach
            // the system prompt.
            'core_rules'     => 'nullable|array',
            'core_rules.*'   => 'string|max:500',
        ]);

        return response()->json(
            $this->onboarding->apply($request->user()->organization_id, $validated)
        );
    }

    /** Dismiss without configuring. Stamps the same marker so it stays dismissed. */
    public function skip(Request $request): JsonResponse
    {
        $this->onboarding->skip($request->user()->organization_id);

        return response()->json(['completed' => true]);
    }
}
