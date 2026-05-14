<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-user preference endpoints for the currently-authenticated staff
 * member. Org-level settings live in SettingsController; this is for
 * the small set of settings each staff member chooses for themselves
 * (today: just the Engagement daily summary opt-in, expandable later).
 */
class MeController extends Controller
{
    /**
     * Whitelist of locale codes the admin SPA + mobile apps recognize.
     * Keep in sync with `src/i18n/index.ts > SUPPORTED_LANGUAGES`. We
     * pin to a finite list rather than `regex:/^[a-z]{2}$/` so bad
     * client code can't write a locale we have no translations for
     * and end up rendering the i18n key strings to the user.
     */
    public const SUPPORTED_LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    public function preferences(Request $request): JsonResponse
    {
        $user = $request->user();
        return response()->json([
            'wants_daily_summary'         => (bool) ($user->wants_daily_summary ?? false),
            'daily_summary_last_sent_at'  => $user->daily_summary_last_sent_at?->toIso8601String(),
            'wants_loyalty_digest'        => (bool) ($user->wants_loyalty_digest ?? false),
            'loyalty_digest_last_sent_at' => $user->loyalty_digest_last_sent_at?->toIso8601String(),
            'language'                    => $user->language ?: 'en',
        ]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'wants_daily_summary'   => 'sometimes|boolean',
            'wants_loyalty_digest'  => 'sometimes|boolean',
            'language'              => ['sometimes', 'string', 'in:' . implode(',', self::SUPPORTED_LANGUAGES)],
        ]);

        $user = $request->user();
        $user->fill($validated)->save();

        return response()->json([
            'wants_daily_summary'         => (bool) $user->wants_daily_summary,
            'daily_summary_last_sent_at'  => $user->daily_summary_last_sent_at?->toIso8601String(),
            'wants_loyalty_digest'        => (bool) $user->wants_loyalty_digest,
            'loyalty_digest_last_sent_at' => $user->loyalty_digest_last_sent_at?->toIso8601String(),
            'language'                    => $user->language ?: 'en',
        ]);
    }
}
