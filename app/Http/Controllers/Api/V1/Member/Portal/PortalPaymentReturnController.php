<?php

namespace App\Http\Controllers\Api\V1\Member\Portal;

use App\Http\Controllers\Controller;
use App\Models\BookingMirror;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Services\Booking\PaymentUnverifiable;
use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\Booking\StayQuoteService;
use App\Services\MemberProvisioner;
use App\Services\Portal\AppointmentClock;
use App\Services\Portal\MemberBookingQuery;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Release 4, part C — the return from a redirect-based payment method (a
 * bank, a wallet). Stripe sends the member back to `/portal/book/return
 * ?payment_intent=pi_…`; the portal's in-memory booking flow is gone by
 * then, so the return page asks HERE what the payment is for, and then
 * confirms through the ordinary confirm endpoints, which check everything
 * again (PortalPaymentIntentGuard::verify()/verifyStay(), amount, hold,
 * slot) and release on every refusal exactly as they always do.
 *
 * Read only: this answers from the intent's own metadata, which only the
 * server writes (`portal_hold_token` for a stay; service, start, person,
 * party, extras and coupon for an appointment) — never from anything the
 * client says — and it cancels, releases or writes nothing. An intent that
 * is not this member's own portal intent in this organisation is answered
 * exactly like one that does not exist (404 `payment_not_found`) and is
 * never touched.
 */
class PortalPaymentReturnController extends Controller
{
    public function show(Request $request, string $paymentIntent, PortalPaymentIntentGuard $guard, MemberProvisioner $provisioner, StayQuoteService $quotes, StripeService $stripe): JsonResponse
    {
        $member = $provisioner->ensureForUser($request->user());
        if (!$member) {
            return response()->json(['error' => 'no_membership', 'message' => 'Your membership is not set up yet.'], 422);
        }
        $orgId = (int) app('current_organization_id');
        $memberId = (int) $member->id;
        if (!PortalPaymentIntentGuard::isRealIntent($paymentIntent)) {
            return $this->notFound();
        }

        try {
            $own = $guard->ownIntent($paymentIntent, $orgId, $memberId);
        } catch (PaymentUnverifiable) {
            return response()->json(['error' => PaymentUnverifiable::CODE, 'message' => PaymentUnverifiable::MESSAGE], 503);
        }
        if ($own === null) {
            return $this->notFound();
        }

        $meta = $own['metadata'];
        $pi = $own['intent'];
        $kind = ($meta['kind'] ?? null) === 'portal_stay_booking' ? 'stay' : 'service';
        $currency = strtoupper((string) ($this->field($pi, 'currency') ?: $stripe->currency()));
        $answer = [
            'kind'              => $kind,
            'state'             => $this->state($own['status'], $own['carried']),
            'payment_intent_id' => $paymentIntent,
            'amount'            => StripeService::fromSmallestUnit((int) $this->field($pi, 'amount'), $currency),
            'currency'          => $currency,
            'booking'           => null,
            'service'           => null,
            'stay'              => null,
        ];

        if ($own['carried']) {
            // Confirmed already (the page was reloaded, or the in-page confirm won): the booking, when it is the member's.
            $answer['booking'] = $this->carriedBooking($paymentIntent, $orgId, $memberId);

            return response()->json($answer);
        }

        if ($kind === 'stay') {
            $hold = $quotes->ownHold($member, (string) ($meta['portal_hold_token'] ?? ''));
            if ($hold) {
                $p = $hold->payload_json;
                $answer['stay'] = [
                    'hold_token'  => $hold->hold_token,
                    'hold_active' => $hold->isActive(),
                    'room'        => ['id' => (string) ($p['unit_id'] ?? ''), 'name' => (string) ($p['unit_name'] ?? '')],
                    'check_in'    => (string) ($p['check_in'] ?? ''),
                    'check_out'   => (string) ($p['check_out'] ?? ''),
                    'nights'      => (int) ($p['nights'] ?? 0),
                    'adults'      => (int) ($p['adults'] ?? 0),
                    'children'    => (int) ($p['children'] ?? 0),
                ];
            }
        } else {
            $answer['service'] = $this->serviceBooking($meta, $orgId);
        }

        return response()->json($answer);
    }

    /** What the member's return can do with the payment, from Stripe's own status. */
    private function state(string $status, bool $carried): string
    {
        if ($carried) {
            return 'booked';
        }

        return match ($status) {
            'requires_capture', 'succeeded' => 'authorised',
            'processing'                    => 'processing',
            default                         => 'failed',
        };
    }

    /**
     * The appointment the intent was made for, rebuilt from its metadata:
     * the body the confirm needs (the start in the venue's offset, as the
     * portal shows it) and the names to show. Null for an intent made before
     * release 4 (no party size in its metadata): it never had a return.
     */
    private function serviceBooking(array $meta, int $orgId): ?array
    {
        if (!array_key_exists('party_size', $meta) || !is_string($meta['start_at'] ?? null) || (int) ($meta['service_id'] ?? 0) <= 0) {
            return null;
        }
        $service = Service::withoutGlobalScopes()->where('organization_id', $orgId)->find((int) $meta['service_id']);
        if (!$service) {
            return null;
        }
        $masterId = ($meta['master_id'] ?? '') !== '' ? (int) $meta['master_id'] : null;
        $master = $masterId ? ServiceMaster::withoutGlobalScopes()->where('organization_id', $orgId)->find($masterId) : null;

        $extras = [];
        $decoded = json_decode((string) ($meta['extras'] ?? '[]'), true);
        foreach (is_array($decoded) ? $decoded : [] as $pair) {
            if (is_array($pair) && isset($pair[0])) {
                $extras[] = ['id' => (int) $pair[0], 'quantity' => max(1, (int) ($pair[1] ?? 1))];
            }
        }

        $coupon = null;
        if (preg_match('/^(offer|redemption):(\d+)$/', (string) ($meta['coupon'] ?? ''), $m)) {
            $coupon = $m[1] === 'offer' ? ['member_offer_id' => (int) $m[2]] : ['redemption_id' => (int) $m[2]];
        }

        $start = AppointmentClock::iso($meta['start_at'], AppointmentClock::zoneFor($orgId));

        return [
            'body' => [
                'service_id' => (int) $service->id,
                'master_id'  => $masterId,
                'start_at'   => $start,
                'party_size' => max(1, (int) $meta['party_size']),
                'extras'     => $extras,
                'coupon'     => $coupon,
            ],
            'name'     => (string) $service->name,
            'master'   => $master ? (string) $master->name : null,
            'start_at' => $start,
        ];
    }

    /** The member's own booking that carries this intent, as the bookings list shows it, or null. */
    private function carriedBooking(string $piId, int $orgId, int $memberId): ?array
    {
        $service = ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)
            ->where('stripe_payment_intent_id', $piId)->where('member_id', $memberId)->first();
        if ($service) {
            return MemberBookingQuery::serviceDto($service->load(['service', 'master']));
        }
        $stay = BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)
            ->where('stripe_payment_intent_id', $piId)->where('member_id', $memberId)->first();

        return $stay ? MemberBookingQuery::stayDto($stay) : null;
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['error' => 'payment_not_found', 'message' => 'We could not find this payment.'], 404);
    }

    /** A Stripe\PaymentIntent's field; tolerates an array too (test doubles). */
    private function field(mixed $pi, string $key): mixed
    {
        return is_array($pi) ? ($pi[$key] ?? null) : ($pi->{$key} ?? null);
    }
}
