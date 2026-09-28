<?php

namespace App\Services\Portal;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\PushNotification;
use App\Models\User;
use App\Services\Booking\BookingCapability;
use App\Services\DiscountService;
use App\Services\IndustryPrompts\IndustryPromptService;
use App\Services\LoyaltyService;
use App\Services\StripeService;
use Illuminate\Support\Facades\Log;

/**
 * Everything the portal shell needs on load, in one call: who the venue is
 * and how it looks, what the member can do here, what the card says.
 *
 * Capabilities are facts about the data, not the industry alone: a salon
 * with no rota cannot take appointments, a hotel with no rooms cannot sell
 * a stay, and a venue without Stripe (or with Stripe in another currency
 * than the booking kind) takes payment at the desk.
 */
final class PortalBootstrap
{
    public function __construct(
        private BookingCapability $capability,
        private LoyaltyService $loyalty,
        private DiscountService $discounts,
        private IndustryPromptService $industries,
        private MemberBookingQuery $bookings,
    ) {
    }

    /**
     * Whether this organisation runs a loyalty programme at all: a live
     * tier to belong to, and an industry profile that offers loyalty in
     * the first place (medical, for one, does not). Extracted from
     * build()'s own check so any caller that only has an org id — the
     * service-booking controller's member-price lookup, for one — can
     * ask the same question without constructing a member first.
     */
    public static function loyaltyOn(int $orgId): bool
    {
        $hasTier = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->exists();
        if (!$hasTier) {
            return false;
        }

        $org = Organization::withoutGlobalScopes()->find($orgId);
        if (!$org) {
            return false;
        }

        return app(IndustryPromptService::class)->for(PortalTheme::for($org)['industry'])->hasLoyalty;
    }

    /**
     * The venue's own time zone — what the portal sends as
     * `venue.timezone` and what the booking window counts days in.
     */
    public static function timezone(Organization $org): string
    {
        return $org->timezone ?: config('app.timezone', 'UTC');
    }

    public function build(User $user, ?LoyaltyMember $member): array
    {
        $org = Organization::withoutGlobalScopes()->findOrFail($user->organization_id);
        $theme = PortalTheme::for($org);
        $industry = $theme['industry'];

        $loyalty = self::loyaltyOn($org->id);

        return [
            'venue'        => $this->venue($org, $theme),
            'capabilities' => $this->capabilities($org, $industry, $loyalty, $member !== null),
            'policies'     => [
                'services_cancel_hours'        => (int) HotelSetting::getValue('services_cancel_hours', 24),
                'booking_cancel_hours'         => (int) HotelSetting::getValue('booking_cancel_hours', 48),
                'services_cancellation_policy' => (string) HotelSetting::getValue('services_cancellation_policy', ''),
            ],
            'member'       => $member ? $this->member($member, $loyalty) : null,
            'counts'       => [
                'unread_notifications' => $member ? PushNotification::where('member_id', $member->id)
                    ->where('is_sent', true)->whereNull('read_at')->count() : 0,
                'upcoming_bookings'    => $member ? $this->upcomingBookings($member) : 0,
            ],
        ];
    }

    private function venue(Organization $org, array $theme): array
    {
        return [
            'name'         => $org->name,
            'logo_url'     => $theme['logo_url'],
            'industry'     => $theme['industry'],
            'currency'     => strtoupper((string) ($org->currency ?: HotelSetting::getValue('services_currency', 'EUR'))),
            'timezone'     => self::timezone($org),
            'contact'      => ['email' => $org->email ?: null, 'phone' => $org->phone ?: null],
            'accent'       => $theme['accent'],
            'display_face' => $theme['display_face'],
        ];
    }

    /**
     * Whether online payment is available for a booking priced in
     * $currency, and why not when it isn't. The one rule every booking
     * kind's payment capability shares — Stripe configured and live, not
     * sandboxed by mock mode, and the booking's own currency matching what
     * Stripe will actually charge — lives here once so capabilities() and
     * the service-booking quote/payment-intent endpoints can never drift.
     *
     * @return array{mode: 'online'|'at_venue', reason: null|'payments_off'|'mock_mode'|'currency_mismatch'}
     */
    public static function paymentMode(string $currency): array
    {
        $stripe = app(StripeService::class);
        if (!$stripe->isEnabled()) {
            return ['mode' => 'at_venue', 'reason' => 'payments_off'];
        }

        $mock = filter_var(HotelSetting::getValue('booking_mock_mode', false), FILTER_VALIDATE_BOOLEAN);
        if ($mock) {
            return ['mode' => 'at_venue', 'reason' => 'mock_mode'];
        }

        if (strtoupper($currency) !== strtoupper((string) $stripe->currency())) {
            return ['mode' => 'at_venue', 'reason' => 'currency_mismatch'];
        }

        return ['mode' => 'online', 'reason' => null];
    }

    /**
     * `services` needs a membership row as well as a bookable venue: the
     * portal's quote, payment-intent and confirm all answer `no_membership`
     * without one (a venue with no loyalty tiers — every medical venue among
     * them — never provisions one), and the portal must not offer a Book
     * page that cannot work. Those members book through the public widget.
     */
    private function capabilities(Organization $org, string $industry, bool $loyalty, bool $hasMember): array
    {
        $stripe = app(StripeService::class);
        $services = (string) HotelSetting::getValue('services_currency', 'EUR');
        $stays    = (string) HotelSetting::getValue('booking_currency', 'EUR');

        $servicesMode = self::paymentMode($services);
        $staysMode    = self::paymentMode($stays);
        $payServices  = $servicesMode['mode'] === 'online';
        $payStays     = $staysMode['mode'] === 'online';

        if ($servicesMode['reason'] === 'currency_mismatch' || $staysMode['reason'] === 'currency_mismatch') {
            Log::warning('portal: booking currency differs from Stripe currency; paying at the venue', [
                'organization_id' => $org->id, 'stripe' => strtolower((string) $stripe->currency()), 'services' => strtolower($services), 'stays' => strtolower($stays),
            ]);
        }

        return [
            'loyalty'  => $loyalty,
            'services' => $hasMember && $this->capability->appointmentsBookable($org->id),
            'stays'    => $industry === 'hotel' && $this->capability->staysBookable($org->id),
            'chat'     => true,
            'payments' => [
                'services'        => $payServices,
                'stays'           => $payStays,
                'publishable_key' => ($payServices || $payStays) ? ($stripe->publishableKey() ?: null) : null,
            ],
        ];
    }

    private function member(LoyaltyMember $member, bool $loyalty): array
    {
        $member->loadMissing(['tier', 'user']);
        $summary = $this->loyalty->getMemberSummary($member);

        $summary['benefits'] = $loyalty
            ? $this->discounts->benefitsFor($member)->map(fn ($tb) => [
                'id'           => $tb->id,
                'name'         => $tb->benefit->name,
                'category'     => $tb->benefit->category,
                'display'      => $tb->value,
                'value_type'   => $tb->value_type,
                'value_amount' => $tb->value_amount !== null ? (float) $tb->value_amount : null,
            ])->values()->all()
            : [];

        return $summary;
    }

    private function upcomingBookings(LoyaltyMember $member): int
    {
        return $this->bookings->count($member, MemberBookingQuery::UPCOMING);
    }
}
