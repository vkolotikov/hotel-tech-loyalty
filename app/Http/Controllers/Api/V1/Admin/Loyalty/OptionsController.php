<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Loyalty\Programme\ProgrammeOverview;
use App\Services\Loyalty\Programme\ProgrammeSetup;
use App\Services\LoyaltyPresetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * "Ways to earn" and the setup wizard (release 7, spec 2026-10-25 §1). Everyone reads the options; only a manager
 * changes them, applies the wizard or skips it (`manager_only`, as Program). Every answer is the page's whole shape
 * (ProgrammeOverview), so the workspace replaces what it shows with it; the wizard's apply adds its `setup` outcome.
 *
 * - `PUT options` `{options: {<option>: value, …}}` — a partial change through ProgrammeOptions::save (422 with field
 *   errors keyed by option; the wizard's own stamp is not writable here). Setting a value it already holds writes and
 *   audits nothing, so a retry is harmless.
 * - `POST options/setup` `{preset?, options, idempotency_key?}` (or an `Idempotency-Key` header) — ProgrammeSetup::apply.
 * - `POST options/setup/skip` — stamps the wizard as done, nothing else.
 */
class OptionsController extends Controller
{
    public function show(Request $request, ProgrammeOverview $overview): JsonResponse
    {
        return response()->json($overview->for(self::orgId(), $request->user()));
    }

    public function update(Request $request, ProgrammeOverview $overview): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate(['options' => 'present|array']);

        ProgrammeOptions::save(self::orgId(), $data['options'], $request->user());

        return response()->json($overview->for(self::orgId(), $request->user()));
    }

    public function setup(Request $request, ProgrammeSetup $setup, ProgrammeOverview $overview): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $data = $request->validate([
            'preset'          => ['nullable', 'string', Rule::in(array_keys(LoyaltyPresetService::PRESETS))],
            'options'         => 'present|array',
            'idempotency_key' => 'nullable|string|max:64',
        ]);
        $key = $data['idempotency_key'] ?? (trim((string) $request->header('Idempotency-Key')) ?: null);

        $outcome = $setup->apply(self::orgId(), $data['preset'] ?? null, $data['options'], $request->user(), $key);

        return response()->json($overview->for(self::orgId(), $request->user()) + ['setup' => $outcome]);
    }

    public function skip(Request $request, ProgrammeSetup $setup, ProgrammeOverview $overview): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $setup->skip(self::orgId(), $request->user());

        return response()->json($overview->for(self::orgId(), $request->user()));
    }

    private static function orgId(): int
    {
        return (int) app('current_organization_id');
    }
}
