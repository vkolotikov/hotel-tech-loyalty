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
use Carbon\CarbonImmutable;
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
     * the first place (every industry does today). Extracted from
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
     * `venue.timezone` and what every booking window counts days in.
     *
     * Two sources, in this order: the zone the venue set in Settings →
     * General → Timezone (the `hotel_timezone` setting, seeded `UTC`), then
     * `organizations.timezone` (defaults to `UTC`; no admin screen writes
     * it). Both are free text, so each is read through namedZone(). The
     * first that names a real zone other than UTC wins; otherwise a source
     * that says UTC gives `UTC` (a venue may really be on UTC); only when
     * neither names a zone does the application's zone stand in, instead of
     * failing every date calculation.
     */
    public static function timezone(Organization $org): string
    {
        $found = null;
        foreach ([self::zoneSetting((int) $org->id), $org->timezone] as $raw) {
            $zone = self::namedZone($raw);
            if ($zone === null) {
                continue;
            }
            if ($zone !== 'UTC') {
                return $zone;
            }
            $found = 'UTC';
        }

        return $found ?? config('app.timezone', 'UTC');
    }

    /** The names of UTC itself, lower-case: every one of them means `UTC`. */
    private const UTC_NAMES = [
        'utc', 'uct', 'universal', 'zulu', 'gmt', 'gmt0', 'gmt+0', 'gmt-0', 'greenwich',
        'etc/utc', 'etc/uct', 'etc/universal', 'etc/zulu', 'etc/gmt', 'etc/gmt0', 'etc/gmt+0', 'etc/gmt-0', 'etc/greenwich',
    ];

    /**
     * The zone a free-text value names, or null: `UTC` for any name of UTC
     * (case-insensitive), the trimmed value for a named zone with a location
     * (`Europe/Riga`, a legacy name like `US/Eastern`), and null for
     * anything else — garbage, and also an abbreviation (`EET`, `CEST`,
     * `PST`, `Z`) or an offset (`+03:00`), which PHP accepts as a fixed
     * offset without daylight saving and a browser reads differently or not
     * at all. Also the test AppointmentClock applies to a zone it is given.
     */
    public static function namedZone(mixed $raw): ?string
    {
        $zone = trim((string) $raw);
        if ($zone === '') {
            return null;
        }
        if (in_array(strtolower($zone), self::UTC_NAMES, true)) {
            return 'UTC';
        }
        try {
            // A named zone has a location; an abbreviation or an offset has none.
            return (new \DateTimeZone($zone))->getLocation() !== false ? $zone : null;
        } catch (\Exception) {
            return null;
        }
    }

    /** Container key of the per-request memo of the `hotel_timezone` setting (a scoped instance, like AppointmentClock's). */
    private const ZONE_SETTING_MEMO = 'portal.bootstrap.zone_settings';

    /**
     * The `hotel_timezone` setting of THIS organisation — the value
     * BookingEngineService reads with HotelSetting::getValue() — read once
     * per organisation per request. For the bound tenant it is getValue()
     * itself (its cached settings map, shared with every other setting the
     * request reads); for any other organisation (the commands that iterate
     * organisations) the organisation's own row, read directly. A database
     * error propagates.
     */
    private static function zoneSetting(int $organizationId): ?string
    {
        $app = app();
        if (!$app->bound(self::ZONE_SETTING_MEMO)) {
            $app->scoped(self::ZONE_SETTING_MEMO, fn () => new \ArrayObject());
        }
        /** @var \ArrayObject<int, string> $memo */
        $memo = $app->make(self::ZONE_SETTING_MEMO);

        if (!isset($memo[$organizationId])) {
            $bound = $app->bound('current_organization_id') ? (int) $app->make('current_organization_id') : 0;
            $value = $bound === $organizationId
                ? HotelSetting::getValue('hotel_timezone')
                : HotelSetting::withoutGlobalScopes()
                    ->where('organization_id', $organizationId)
                    ->where('key', 'hotel_timezone')
                    ->first()?->typed_value;
            $memo[$organizationId] = is_string($value) ? $value : '';
        }

        return $memo[$organizationId] !== '' ? $memo[$organizationId] : null;
    }


    /** Midnight today in the venue's own time zone. */
    public static function venueToday(int $orgId): CarbonImmutable
    {
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $zone = $org ? self::timezone($org) : config('app.timezone', 'UTC');

        return CarbonImmutable::now($zone)->startOfDay();
    }

    /** The venue's stay policies as saved in Settings → Booking (`booking_policies`, JSON). */
    public static function stayPolicies(): array
    {
        $raw = HotelSetting::getValue('booking_policies', '');
        $p = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?: []);

        return [
            'check_in_time'       => self::clock($p['check_in_time'] ?? null, '15:00'),
            'check_out_time'      => self::clock($p['check_out_time'] ?? null, '11:00'),
            'cancellation_policy' => trim((string) ($p['cancellation_policy'] ?? $p['cancellation'] ?? '')) ?: null,
            'payment_terms'       => trim((string) ($p['payment_terms'] ?? '')) ?: null,
        ];
    }

    /** "16:00", "4:00" or "16:00:00" → "16:00"; anything else → $default. */
    private static function clock(mixed $value, string $default): string
    {
        return is_string($value) && preg_match('/^(\d{1,2}):(\d{2})(:\d{2})?$/', trim($value), $m) && (int) $m[1] < 24 && (int) $m[2] < 60
            ? sprintf('%02d:%02d', (int) $m[1], (int) $m[2])
            : $default;
    }

    public function build(User $user, ?LoyaltyMember $member): array
    {
        $org = Organization::withoutGlobalScopes()->findOrFail($user->organization_id);
        $theme = PortalTheme::for($org);

        $loyalty = self::loyaltyOn($org->id);
        $stayPolicies = self::stayPolicies();

        return [
            'venue'        => $this->venue($org, $theme),
            'capabilities' => $this->capabilities($org, $loyalty, $member !== null),
            'policies'     => [
                'services_cancel_hours'        => (int) HotelSetting::getValue('services_cancel_hours', 24),
                'booking_cancel_hours'         => (int) HotelSetting::getValue('booking_cancel_hours', 48),
                'services_cancellation_policy' => (string) HotelSetting::getValue('services_cancellation_policy', ''),
                'booking_cancellation_policy'  => (string) ($stayPolicies['cancellation_policy'] ?? ''),
                'check_in_time'                => $stayPolicies['check_in_time'],
                'check_out_time'               => $stayPolicies['check_out_time'],
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
     * `services` and `stays` both need a membership row as well as a
     * bookable venue: the portal's quote, payment-intent and confirm all
     * answer `no_membership` without one, and the portal must not offer a
     * page that cannot work. A membership row exists whenever the venue has
     * an active tier (MemberProvisioner). Neither asks about the industry:
     * booking is gated on what the venue can actually sell.
     */
    private function capabilities(Organization $org, bool $loyalty, bool $hasMember): array
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
            'stays'    => $hasMember && $this->capability->staysBookableOnline($org->id),
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
