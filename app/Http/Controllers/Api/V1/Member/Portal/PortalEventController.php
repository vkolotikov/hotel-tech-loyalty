<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Models\LoyaltyEvent;
use App\Models\LoyaltyMember;
use App\Services\Loyalty\Events\EventSignUp;
use App\Services\Loyalty\Events\PortalEvents;
use App\Services\Loyalty\LoyaltyRefused;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The member portal's events (release 8, spec 2026-10-25 §4), the member's own only (`member.only`):
 *
 * - `GET member/portal/events` → `{ upcoming: [row], attended: [{ id, title, starts_at, points }] }`
 *   (PortalEvents::forMember(); both empty while the venue's programme is off).
 * - `POST member/portal/events/{id}/sign-up`, `DELETE member/portal/events/{id}/sign-up` → `{ event: row }`.
 *   EventSignUp decides; its refusals answer `{ error, message }` (`sign_up_closed`, `event_full`, `tier_not_allowed`
 *   with `allowed_tiers`, `membership_expired` with `valid_until`, `inactive`, `already_in`, `cancel_closed`,
 *   `not_signed_up`), 409. Signing up again while signed up answers the event (a second tap is not an error). An event
 *   that is not published — a draft, or another venue's — is 404 `not_found`.
 */
class PortalEventController extends Controller
{
    public function index(Request $request, PortalEvents $events): JsonResponse
    {
        $member = $this->member($request);
        if (!PortalBootstrap::loyaltyOn((int) $member->organization_id)) {
            return response()->json(['upcoming' => [], 'attended' => []]);
        }

        return response()->json($events->forMember($member));
    }

    public function signUp(Request $request, int $id, EventSignUp $signUps): JsonResponse
    {
        $member = $this->member($request);
        $event = $this->event($member, $id);
        try {
            $signUps->signUp($event, $member, EventSignUp::PORTAL);
        } catch (LoyaltyRefused $refused) {
            if ($refused->errorCode !== 'already_signed_up') {
                throw $refused;
            }
        }

        return response()->json(['event' => PortalEvents::row($event->fresh() ?? $event, $member->fresh(['user']) ?? $member)]);
    }

    public function cancelSignUp(Request $request, int $id, EventSignUp $signUps): JsonResponse
    {
        $member = $this->member($request);
        $event = $this->event($member, $id);
        $signUps->cancel($event, $member, EventSignUp::PORTAL);

        return response()->json(['event' => PortalEvents::row($event->fresh() ?? $event, $member->fresh(['user']) ?? $member)]);
    }

    private function member(Request $request): LoyaltyMember
    {
        return $request->user()->loyaltyMember()->with('user')->firstOrFail();
    }

    /** A published or cancelled event of the member's venue; a draft is nobody's business but staff's. */
    private function event(LoyaltyMember $member, int $id): LoyaltyEvent
    {
        return LoyaltyEvent::withoutGlobalScopes()->where('organization_id', $member->organization_id)
            ->whereIn('status', [LoyaltyEvent::PUBLISHED, LoyaltyEvent::CANCELLED])->find($id)
            ?? throw LoyaltyRefused::notFound();
    }
}
