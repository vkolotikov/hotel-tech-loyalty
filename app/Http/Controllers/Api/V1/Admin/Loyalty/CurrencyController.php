<?php

namespace App\Http\Controllers\Api\V1\Admin\Loyalty;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\BookingRules;
use App\Services\Loyalty\LoyaltyAccess;
use App\Services\Loyalty\LoyaltyForms;
use App\Services\Portal\PortalBootstrap;
use App\Services\StripeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The venue's currency in Card & app (release 4, R4-5), a manager's: one field that writes the very setting the
 * Appointments Setup writes — BookingRules::write(), which sets `organizations.currency` and `services_currency` and
 * labels every service and extra with it (a price is relabelled, never converted). There is no second way to write it.
 * What the bootstrap (`venue.currency`) and the member portal show is PortalBootstrap::currency(), the new one after.
 *
 * `PUT currency` with `dry_run` answers what the change would mean, and the screen says it before the manager saves
 * (warn, list, still allow, as Setup does): the services and extras that get the new label; that online payments are
 * set up in another currency (PortalBootstrap::paymentMode()'s check: bookings would then be paid at the venue);
 * the appointments already booked in another currency (they keep theirs); and that stays keep their own currency
 * (`booking_currency`, the full admin's booking settings), which this field does not change.
 */
class CurrencyController extends Controller
{
    /** `GET currency`: the venue's currency and the ones to choose from. */
    public function show(Request $request): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());

        return response()->json(self::answer($this->org()));
    }

    /** `PUT currency` (`currency`, `dry_run`): the change, or with `dry_run` only what it would mean. */
    public function update(Request $request, BookingRules $rules): JsonResponse
    {
        LoyaltyAccess::requireManager($request->user());
        $org = $this->org();
        $from = PortalBootstrap::currency($org);
        if (is_string($request->input('currency'))) {
            $request->merge(['currency' => strtoupper(trim($request->input('currency')))]);
        }
        $data = $request->validate([
            'currency' => ['required', 'string', Rule::in(LoyaltyForms::currencies($from))],
            'dry_run'  => 'sometimes|boolean',
        ]);
        $to = (string) $data['currency'];

        if ($request->boolean('dry_run')) {
            return response()->json(['dry_run' => true, 'from' => $from, 'to' => $to] + self::consequences((int) $org->id, $to));
        }

        $rules->write($org, ['currency' => $to]);
        $org = $org->fresh();
        AuditLog::record('loyalty.currency_changed', $org, ['currency' => $to], ['currency' => $from], $request->user(),
            "Currency set to {$to} in HexaTech Loyalty (was {$from})");

        return response()->json(self::answer($org));
    }

    /** @return array{currency: string, options: list<string>} */
    private static function answer(Organization $org): array
    {
        $currency = PortalBootstrap::currency($org);

        return ['currency' => $currency, 'options' => LoyaltyForms::currencies($currency)];
    }

    /**
     * What setting `$to` would mean now (every brand of the organisation).
     *
     * @return array<string, mixed>
     */
    private static function consequences(int $orgId, string $to): array
    {
        $payment = PortalBootstrap::paymentMode($to);
        $mismatch = $payment['reason'] === 'currency_mismatch';
        $other = ServiceBooking::withoutGlobalScopes()->where('organization_id', $orgId)->where('currency', '<>', $to);
        $upcoming = (clone $other)->whereIn('status', ['pending', 'confirmed', 'in_progress'])
            ->where('start_at', '>=', VenueClock::now($orgId)->format('Y-m-d H:i:s'))->count();
        // A stay's currency as the portal and the widget read it (MemberBookingQuery::stayDto), the same default.
        $stays = strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR'));
        $hasStays = $stays !== $to
            && BookingMirror::withoutGlobalScopes()->where('organization_id', $orgId)->exists();

        return [
            'relabel'  => BookingRules::currencyImpact($orgId, $to),
            'payments' => ['mismatch' => $mismatch, 'currency' => $mismatch ? strtoupper((string) app(StripeService::class)->currency()) : null],
            'bookings' => ['total' => $other->count(), 'upcoming' => $upcoming],
            'stays'    => $hasStays ? ['currency' => $stays] : null,
        ];
    }

    private function org(): Organization
    {
        return Organization::withoutGlobalScopes()->findOrFail((int) app('current_organization_id'));
    }
}
