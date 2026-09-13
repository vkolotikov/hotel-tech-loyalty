<?php

namespace App\Http\Controllers\Voice;

use App\Http\Controllers\Controller;
use App\Models\VoiceAlexaLink;
use App\OAuth\PluginIdentity;
use App\Voice\Alexa\AlexaPairing;
use App\Voice\VoiceCapability;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * A staff member's own Echo links. Listing, changing and unlinking stay
 * available when voice is switched off, so a person can always withdraw a
 * device; only issuing a new code requires voice to be available.
 */
class VoiceAlexaLinkController extends Controller
{
    public function index(Request $request, VoiceCapability $capability): JsonResponse
    {
        $links = VoiceAlexaLink::query()->live()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('linked_at')
            ->get();

        return response()->json([
            'enabled' => $this->linkingAvailable($request, $capability),
            'links' => $links->map(fn (VoiceAlexaLink $link) => $this->present($link))->values(),
        ]);
    }

    public function pairingCode(Request $request, VoiceCapability $capability, AlexaPairing $pairing): JsonResponse
    {
        if (! $this->linkingAvailable($request, $capability)) {
            return response()->json(['message' => 'Echo linking is unavailable for this workspace.'], 403);
        }

        return response()->json([
            'code' => $pairing->issue($request->user()),
            'expires_in' => (int) config('voice.alexa.pairing_ttl_seconds', 600),
        ]);
    }

    public function update(Request $request, int $link): JsonResponse
    {
        $data = $request->validate(['can_write' => ['required', 'boolean']]);

        $record = $this->own($request, $link);
        $record->forceFill(['can_write' => (bool) $data['can_write']])->save();

        return response()->json(['link' => $this->present($record)]);
    }

    public function destroy(Request $request, int $link): Response
    {
        $this->own($request, $link)->forceFill(['revoked_at' => now(), 'can_write' => false])->save();

        return response()->noContent();
    }

    /** Someone else's link is indistinguishable from one that does not exist. */
    private function own(Request $request, int $id): VoiceAlexaLink
    {
        return VoiceAlexaLink::query()->live()->where('user_id', $request->user()->id)->findOrFail($id);
    }

    /**
     * A code is only worth issuing if the Echo could then answer: Alexa must be
     * on, the organization allowed voice, and the staff member pass the plugin
     * identity check that every voice tool demands.
     */
    private function linkingAvailable(Request $request, VoiceCapability $capability): bool
    {
        if (! config('voice.alexa.enabled') || ! PluginIdentity::active($request->user())) {
            return false;
        }

        try {
            $capability->assertEnabled($request->user());

            return true;
        } catch (AuthorizationException) {
            return false;
        }
    }

    /** Never exposes the Amazon account hash. */
    private function present(VoiceAlexaLink $link): array
    {
        return [
            'id' => $link->id,
            'can_write' => (bool) $link->can_write,
            'linked_at' => $link->linked_at?->toIso8601String(),
            'last_used_at' => $link->last_used_at?->toIso8601String(),
        ];
    }
}
