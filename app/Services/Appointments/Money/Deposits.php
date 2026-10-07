<?php

namespace App\Services\Appointments\Money;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\Appointments\VenueClock;
use App\Services\Portal\AppointmentClock;
use App\Services\Portal\PortalBootstrap;
use App\Services\StripeService;
use Carbon\CarbonImmutable;

/**
 * Deposits for online bookings (Part H): what a booking made on the booking
 * page pays now, and until when a cancellation gives it back. The venue's
 * settings are the full admin's own (`services_require_deposit`,
 * `services_deposit_percent`, `services_cancel_hours`), read for the bound
 * organisation; a booking keeps the terms it was made on in
 * `meta.deposit`, so changing a setting later never changes a booking
 * already made.
 */
final class Deposits
{
    /** The metadata `kind` of a deposit's payment intent. */
    public const KIND = 'service_deposit';

    /** The metadata `source` of a deposit's payment intent: the booking page. */
    public const SOURCE = 'services_widget';

    /** Stripe's smallest charge where the currency is not listed below (spec §4.2). */
    public const MINIMUM = 0.50;

    /**
     * Stripe's own minimum charge per currency (its "minimum and maximum charge
     * amounts" table); below it the card step would fail and the client could
     * not book at all, so no deposit is asked. Currencies the venues can pick
     * that Stripe does not list (UAH, TRY, ILS, ZAR: "about USD 0.50") get a
     * floor safely above that.
     */
    public const MINIMUMS = [
        'USD' => 0.50, 'EUR' => 0.50, 'GBP' => 0.30, 'CHF' => 0.50, 'SEK' => 3.00, 'NOK' => 3.00, 'DKK' => 2.50,
        'PLN' => 2.00, 'CZK' => 15.00, 'HUF' => 175.00, 'RON' => 2.00, 'BGN' => 1.00, 'AED' => 2.00, 'CAD' => 0.50,
        'AUD' => 0.50, 'NZD' => 0.50, 'JPY' => 50, 'SGD' => 0.50, 'HKD' => 4.00, 'INR' => 0.50, 'MXN' => 10.00,
        'UAH' => 25.00, 'TRY' => 20.00, 'ILS' => 2.00, 'ZAR' => 10.00,
    ];

    /** What Setup proposes when deposits are first switched on (spec §4.1). */
    public const PROPOSED_PERCENT = 20;

    /**
     * When a manager switched deposits on in the workspace Setup. The full admin's
     * `services_require_deposit` tick did nothing before Part H, so a venue may have
     * ticked it long ago: that tick alone never starts deposits (spec §11).
     */
    public const SINCE = 'services_deposits_since';

    /** Why Setup refuses to switch deposits on (the screen words it in five languages from the reason). */
    public const REASONS = [
        'payments_off'      => 'Switch on online payments with your Stripe keys in the full admin (Settings → Booking) first.',
        'mock_mode'         => 'Bookings are in test mode in the full admin: deposits need real payments.',
        'currency_mismatch' => 'Stripe takes payments in another currency than your prices.',
    ];

    /** Percent of the price, to the cent; null for a free booking or one below Stripe's minimum in that currency. */
    public static function amountFor(float $total, int $percent, string $currency = 'EUR'): ?float
    {
        $total = round($total, 2);
        $amount = round($total * max(1, min(100, $percent)) / 100, 2);

        return $total > 0 && $amount >= (self::MINIMUMS[strtoupper($currency)] ?? self::MINIMUM) ? $amount : null;
    }

    /** Ticked, and switched on in Setup at least once (SINCE). */
    public static function switchedOn(): bool
    {
        return filter_var(HotelSetting::getValue('services_require_deposit', false), FILTER_VALIDATE_BOOL)
            && (string) HotelSetting::getValue(self::SINCE, '') !== '';
    }

    public static function percent(): int
    {
        return max(1, min(100, (int) HotelSetting::getValue('services_deposit_percent', 100)));
    }

    public static function cancelHours(): int
    {
        return max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));
    }

    /** The booking page carries its deposit step: the venue switched deposits on. The API decides per booking whether one is due. */
    public static function pageOn(int $orgId): bool
    {
        $settings = HotelSetting::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('key', ['services_require_deposit', self::SINCE])->pluck('value', 'key');

        return filter_var($settings['services_require_deposit'] ?? false, FILTER_VALIDATE_BOOL)
            && (string) ($settings[self::SINCE] ?? '') !== '';
    }

    /** The venue's booking page, with the chosen service and team member already picked; null without a booking link. */
    public static function bookingPageUrl(int $orgId, ?int $serviceId = null, ?int $masterId = null): ?string
    {
        $token = (string) (Organization::withoutGlobalScopes()->whereKey($orgId)->value('widget_token') ?? '');
        if ($token === '') {
            return null;
        }
        $query = array_filter(['service' => $serviceId, 'master' => $masterId]);

        return url('/services/' . $token) . ($query !== [] ? '?' . http_build_query($query) : '');
    }

    /** Why Stripe cannot take a deposit in this currency now — the portal's own payment check — or null when it can. */
    public static function unavailableReason(string $currency): ?string
    {
        return PortalBootstrap::paymentMode($currency)['reason'];
    }

    /** Deposits are switched on and Stripe can take them in this currency now. */
    public static function onlineNow(string $currency): bool
    {
        return self::switchedOn() && self::unavailableReason($currency) === null;
    }

    /**
     * The terms a booking at this price is made on, or null when it takes no
     * deposit: switched off, Stripe unable (off, test mode, another currency),
     * or a price that asks for none.
     *
     * @return array{amount: float, percent: int, cancel_hours: int, currency: string}|null
     */
    public static function termsFor(float $total, string $currency): ?array
    {
        if (!self::onlineNow($currency)) {
            return null;
        }
        $percent = self::percent();
        $amount = self::amountFor($total, $percent, $currency);

        return $amount === null ? null : [
            'amount' => $amount, 'percent' => $percent, 'cancel_hours' => self::cancelHours(), 'currency' => strtoupper($currency),
        ];
    }

    /**
     * The booking's own terms, as agreed when it was made; null for every other booking.
     *
     * @return array{amount: float, percent: int, cancel_hours: int}|null
     */
    public static function of(ServiceBooking $b): ?array
    {
        $d = ((array) ($b->meta ?? []))['deposit'] ?? null;
        if (!is_array($d) || !isset($d['amount'])) {
            return null;
        }

        return ['amount' => round((float) $d['amount'], 2), 'percent' => (int) ($d['percent'] ?? 0), 'cancel_hours' => max(0, (int) ($d['cancel_hours'] ?? 0))];
    }

    /** The last moment a cancellation gives the deposit back: the visit's current start, less the agreed hours, in real hours. */
    public static function refundUntil(ServiceBooking $b): ?CarbonImmutable
    {
        $d = self::of($b);
        if ($d === null || !$b->start_at) {
            return null;
        }

        return AppointmentClock::toInstant($b->start_at, AppointmentClock::zoneFor((int) $b->organization_id))
            ->utc()->subHours($d['cancel_hours']);
    }

    /** Cancelled at $when: in time up to and including the deadline (spec §7). */
    public static function inTime(ServiceBooking $b, \DateTimeInterface $when): bool
    {
        $until = self::refundUntil($b);

        return $until !== null && CarbonImmutable::instance($when)->lessThanOrEqualTo($until);
    }

    /** The deadline as the client reads it, on the venue's clock: "Mon 5 Oct 2026, 10:00". */
    public static function untilText(ServiceBooking $b): ?string
    {
        return self::refundUntil($b)?->setTimezone(AppointmentClock::zoneFor((int) $b->organization_id))->format('D j M Y, H:i');
    }

    /** What the booking page and its email show. */
    public static function forClient(ServiceBooking $b): ?array
    {
        $d = self::of($b);

        return $d === null ? null : $d + ['currency' => strtoupper((string) ($b->currency ?: 'EUR')), 'refund_until' => self::untilText($b)];
    }

    /** A Stripe intent's metadata as a plain array (Stripe keeps every value a string). */
    public static function metadataOf(mixed $intent): array
    {
        $raw = is_array($intent) ? ($intent['metadata'] ?? null) : ($intent->metadata ?? null);

        return is_array($raw) ? $raw : (is_object($raw) && method_exists($raw, 'toArray') ? $raw->toArray() : []);
    }

    /**
     * The intent pays exactly this booking's deposit: a deposit intent of this
     * venue, for this service at this time, for this amount in this currency.
     * The time is compared as the venue's wall clock (both sides come from the
     * scheduler's own start).
     *
     * @param array{amount: float, currency: string} $deposit
     * @throws DepositRefused
     */
    public static function assertPays(mixed $intent, array $deposit, int $orgId, int $serviceId, \DateTimeInterface|string $start): void
    {
        if ($intent === null) {
            // The page was opened before deposits were switched on: it has no card step until it is reloaded.
            throw new DepositRefused('deposit_required', 'A deposit is now needed to book this time. Please reload the page and book again.');
        }
        $meta = self::metadataOf($intent);
        $pays = ($meta['kind'] ?? null) === self::KIND
            && (int) ($meta['org_id'] ?? 0) === $orgId
            && (int) ($meta['service_id'] ?? 0) === $serviceId
            && VenueClock::wall((string) ($meta['start_at'] ?? '')) === VenueClock::wall($start)
            && strtoupper((string) ($intent->currency ?? '')) === $deposit['currency']
            && (int) ($intent->amount ?? -1) === app(StripeService::class)->toSmallestUnit($deposit['amount'], $deposit['currency']);
        if (!$pays) {
            throw new DepositRefused('deposit_mismatch', 'The deposit does not match this booking. Your card was not charged; please try again.');
        }
    }

    /** What the workspace shows: the terms and the deadline as a real instant (the screen prints it on the venue's clock). */
    public static function forStaff(ServiceBooking $b): ?array
    {
        $d = self::of($b);

        return $d === null ? null : $d + ['refund_until' => self::refundUntil($b)?->toIso8601String()];
    }
}
