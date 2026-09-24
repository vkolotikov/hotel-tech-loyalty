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

    public function build(User $user, ?LoyaltyMember $member): array
    {
        $org = Organization::withoutGlobalScopes()->findOrFail($user->organization_id);
        $theme = PortalTheme::for($org);
        $industry = $theme['industry'];

        $hasTier = LoyaltyTier::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('is_active', true)
            ->exists();
        $loyalty = $hasTier && $this->industries->for($industry)->hasLoyalty;

        return [
            'venue'        => $this->venue($org, $theme),
            'capabilities' => $this->capabilities($org, $industry, $loyalty),
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
            'timezone'     => $org->timezone ?: config('app.timezone', 'UTC'),
            'contact'      => ['email' => $org->email ?: null, 'phone' => $org->phone ?: null],
            'accent'       => $theme['accent'],
            'display_face' => $theme['display_face'],
        ];
    }

    private function capabilities(Organization $org, string $industry, bool $loyalty): array
    {
        $stripe = app(StripeService::class);
        $mock = filter_var(HotelSetting::getValue('booking_mock_mode', false), FILTER_VALIDATE_BOOLEAN);
        $online = $stripe->isEnabled() && !$mock;
        $stripeCurrency = strtolower((string) $stripe->currency());
        $services = strtolower((string) HotelSetting::getValue('services_currency', 'EUR'));
        $stays    = strtolower((string) HotelSetting::getValue('booking_currency', 'EUR'));

        $payServices = $online && $services === $stripeCurrency;
        $payStays    = $online && $stays === $stripeCurrency;
        if ($online && (!$payServices || !$payStays)) {
            Log::warning('portal: booking currency differs from Stripe currency; paying at the venue', [
                'organization_id' => $org->id, 'stripe' => $stripeCurrency, 'services' => $services, 'stays' => $stays,
            ]);
        }

        return [
            'loyalty'  => $loyalty,
            'services' => $this->capability->appointmentsBookable($org->id),
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
