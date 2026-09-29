<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Services\Booking\CancellationException;
use App\Services\Booking\MemberCancellation;
use App\Services\Booking\PortalCancellationNotifier;
use App\Services\Portal\MemberBookingQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PortalBookingController extends Controller
{
    public function __construct(private MemberBookingQuery $bookings)
    {
    }

    /** GET /v1/member/portal/bookings?scope=upcoming|past&page=N */
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) {
            return response()->json(['data' => [], 'meta' => ['scope' => 'upcoming', 'page' => 1, 'per_page' => 20, 'total' => 0]]);
        }

        $scope = $request->query('scope') === MemberBookingQuery::PAST ? MemberBookingQuery::PAST : MemberBookingQuery::UPCOMING;
        $page = max(1, (int) $request->query('page', 1));

        // Every DTO's total is a float; a whole-number amount (60.0) must not
        // silently become the JSON number 60 and decode back as an int.
        return response()->json($this->bookings->list($member, $scope, $page), 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    /** GET /v1/member/portal/bookings/{kind}/{id} */
    public function show(Request $request, string $kind, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        $dto = $member ? $this->bookings->find($member, $kind, $id) : null;

        if (!$dto) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that booking.'], 404);
        }

        return response()->json($dto, 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }

    /**
     * POST /v1/member/portal/bookings/{kind}/{id}/cancel
     *
     * The member's own booking, inside the venue's cancellation window:
     * the money is returned, then the booking is cancelled. Answers the
     * booking as it is now and what happened to the money.
     */
    public function cancel(Request $request, string $kind, int $id, MemberCancellation $cancellation, PortalCancellationNotifier $notifier): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        // Ownership is the list's own rule: a booking the member cannot see, they cannot cancel.
        if (!$member || !$this->bookings->find($member, $kind, $id)) {
            return response()->json(['error' => 'not_found', 'message' => 'We could not find that booking.'], 404);
        }

        try {
            $outcome = $kind === 'stay'
                ? $cancellation->cancelStay((int) $member->organization_id, $id)
                : $cancellation->cancelService((int) $member->organization_id, $id);
        } catch (CancellationException $e) {
            return response()->json(['error' => $e->errorCode, 'message' => $e->getMessage()], $e->status);
        } catch (\Throwable $e) {
            Log::error('portal.cancel_failed', ['kind' => $kind, 'booking' => $id, 'exception' => get_class($e), 'error' => $e->getMessage()]);

            // A failure here can land after the money already moved (a
            // captured payment's refund is committed by MemberCancellation
            // before any of our own writes), so the sentence must not
            // claim nothing happened — and the booking is re-read so the
            // portal can show what is actually true now, not a stale 404.
            $body = ['error' => 'cancel_failed', 'message' => 'We could not finish cancelling this booking. If a refund was due it may already be on its way. Please try again, or contact the venue.'];
            $dto = $this->bookings->find($member, $kind, $id);
            if ($dto) {
                $body['booking'] = $dto;
            }

            return response()->json($body, 500, [], JSON_PRESERVE_ZERO_FRACTION);
        }

        try {
            $notifier->notify($outcome);
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_notify_failed', ['kind' => $kind, 'booking' => $id, 'error' => $e->getMessage()]);
        }

        return response()->json([
            'booking' => $this->bookings->find($member, $kind, $id),
            'refund'  => $outcome->toArray(),
        ], 200, [], JSON_PRESERVE_ZERO_FRACTION);
    }
}
