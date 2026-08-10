<?php

namespace App\Http\Controllers;

use App\Models\LoyaltyMember;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Public, unauthenticated unsubscribe.
 *
 * Deliberately outside every auth, tenant and brand middleware: the person
 * clicking this is in their mail client, not signed in, and may be a year
 * removed from the campaign. The token is the only credential, which is why
 * it is 48 random characters and looked up without global scopes.
 *
 * Two verbs, both required:
 *
 *  - POST is the RFC 8058 one-click path. Gmail and Yahoo call it directly
 *    from their own "Unsubscribe" button, with no human on the other end,
 *    and expect a 200 without a confirmation step.
 *  - GET is for a human who clicked the footer link. It unsubscribes them
 *    immediately too — making someone click a second button to be left
 *    alone is the pattern that generates spam complaints — and then shows
 *    a page confirming it, with a way back if it was a mistake.
 */
class UnsubscribeController extends Controller
{
    /** Human clicks the footer link. */
    public function show(string $token)
    {
        $member = $this->find($token);

        if (!$member) {
            return response()->view('unsubscribe', [
                'state' => 'invalid',
                'orgName' => config('app.name'),
            ], 404);
        }

        $this->optOut($member);

        return response()->view('unsubscribe', [
            'state'   => 'done',
            'email'   => $member->user?->email,
            'token'   => $token,
            'orgName' => $member->organization?->name ?: config('app.name'),
        ]);
    }

    /** Mail client's one-click button (RFC 8058). No page, just a 200. */
    public function oneClick(string $token)
    {
        $member = $this->find($token);

        if ($member) {
            $this->optOut($member);
        }

        // Always 200: telling an automated caller which tokens are real
        // would turn this into an enumeration oracle, and there is nobody
        // to show an error to anyway.
        return response()->noContent();
    }

    /**
     * Undo, for the person who clicked by accident.
     *
     * Restores the channel switch but NOT `marketing_consent` — consent is
     * given deliberately, and a mis-click is not the moment to re-grant it.
     * Re-subscribing here means "you may email me again", which is exactly
     * what the flag it sets says.
     */
    public function resubscribe(Request $request, string $token)
    {
        $member = $this->find($token);

        if ($member) {
            $member->forceFill([
                'email_notifications' => true,
                'unsubscribed_at'     => null,
            ])->save();

            Log::info('member resubscribed', ['member_id' => $member->id]);
        }

        return response()->view('unsubscribe', [
            'state'   => 'resubscribed',
            'email'   => $member?->user?->email,
            'token'   => $token,
            'orgName' => $member?->organization?->name ?: config('app.name'),
        ]);
    }

    private function find(string $token): ?LoyaltyMember
    {
        if (strlen($token) < 20) {
            return null;
        }

        // No tenant context exists on a public route, so the scopes are
        // bypassed explicitly; the token itself carries the authorisation.
        return LoyaltyMember::withoutGlobalScopes()
            ->with(['user:id,email,name', 'organization:id,name'])
            ->where('unsubscribe_token', $token)
            ->first();
    }

    private function optOut(LoyaltyMember $member): void
    {
        if ($member->unsubscribed_at !== null && !$member->email_notifications) {
            return; // already out; keep the original timestamp
        }

        $member->forceFill([
            'email_notifications' => false,
            'unsubscribed_at'     => now(),
        ])->save();

        Log::info('member unsubscribed', [
            'member_id'       => $member->id,
            'organization_id' => $member->organization_id,
        ]);
    }
}
