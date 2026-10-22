<?php

namespace App\Services\Booking;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * "Take bookings to pay at the venue when online payment is unavailable"
 * (release 4, part C). Off by default; switched in the Appointments
 * workspace's Setup → Settings (App\Services\Booking\Setup\BookingRules).
 *
 * When it is on and a portal `payment-intent` call cannot reach Stripe
 * (isStripeUnreachable() — never for any other Stripe error), the call
 * answers `409 pay_at_venue` (reason `payment_unavailable`) together with a
 * grant: a short-lived, encrypted and signed note (Laravel's Crypt, the
 * application key) that names the organisation, the member and the very
 * booking — a stay's hold, or an appointment's service, start and the Pay
 * visit's Idempotency-Key (serviceTarget()). The confirm accepts a
 * booking without a payment only with a grant that still names all three,
 * has not expired, and only while the setting is still on — then it books
 * through the portal's ordinary at-venue path, exactly as for a venue that
 * takes no online payments (PortalBootstrap::paymentMode() `at_venue`). The
 * client carries the grant but cannot write or alter one, and without it a
 * confirm with no payment is `payment_required` as before.
 */
final class PayAtVenueFallback
{
    /** The hotel_settings key BookingRules reads and writes. */
    public const SETTING = 'portal_pay_at_venue_when_unavailable';

    /** The reason the payment-intent call and the confirm name for a booking taken this way. */
    public const REASON = 'payment_unavailable';

    /** How long a grant stays usable: long enough to press Confirm, short enough not to outlive the outage it was given for. */
    public const TTL_SECONDS = 1800;

    /** Whether the bound organisation has switched it on. */
    public static function enabled(): bool
    {
        return filter_var(HotelSetting::getValue(self::SETTING, false), FILTER_VALIDATE_BOOL);
    }

    /** A grant for this organisation, member and target ('stay' + hold token, or 'service' + service id and stored start). */
    public static function grant(string $kind, int $orgId, int $memberId, string $target): string
    {
        return Crypt::encryptString(json_encode([
            'k' => $kind,
            'o' => $orgId,
            'm' => $memberId,
            't' => $target,
            'x' => now()->getTimestamp() + self::TTL_SECONDS,
        ]));
    }

    /**
     * True only when the setting is on and the grant was written by this
     * application for exactly this organisation, member and target, and has
     * not expired. Anything else — no grant, a grant that does not decrypt, a
     * grant for another hold or slot or member — is false.
     */
    public static function allows(?string $grant, string $kind, int $orgId, int $memberId, string $target): bool
    {
        if ($grant === null || $grant === '' || !self::enabled()) {
            return false;
        }
        try {
            $g = json_decode(Crypt::decryptString($grant), true);
        } catch (DecryptException) {
            return false;
        }

        return is_array($g)
            && ($g['k'] ?? null) === $kind
            && (int) ($g['o'] ?? 0) === $orgId
            && (int) ($g['m'] ?? 0) === $memberId
            && is_string($g['t'] ?? null) && hash_equals($target, $g['t'])
            && (int) ($g['x'] ?? 0) >= now()->getTimestamp();
    }

    /**
     * One audit row (`portal.pay_at_venue_fallback`) per booking taken this
     * way, so the venue can see why a venue with online payments has an
     * unpaid portal booking, plus a warning line. Best effort: a failure here
     * never fails a booking that is already committed.
     */
    public static function audit(int $orgId, int $memberId, string $subjectType, int $subjectId, string $reference): void
    {
        Log::warning('portal.pay_at_venue_fallback_booked', ['org' => $orgId, 'member' => $memberId, 'subject' => $subjectType, 'id' => $subjectId]);
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'action'          => 'portal.pay_at_venue_fallback',
                'subject_type'    => $subjectType,
                'subject_id'      => $subjectId,
                'new_values'      => ['member_id' => $memberId, 'reason' => self::REASON, 'reference' => $reference],
                'description'     => "Member portal booking {$reference} taken to pay at the venue: online payment was unavailable",
            ]);
        } catch (\Throwable $e) {
            Log::warning('portal.pay_at_venue_fallback_audit_failed', ['org' => $orgId, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Whether a failure means Stripe could not be reached or is overloaded —
     * the only case the fallback is for: a connection failure
     * (ApiConnectionException), rate limiting (RateLimitException), or any
     * Stripe API error with an HTTP status of 500 or more; and a
     * PaymentUnverifiable (or anything) whose cause is one of those. A revoked
     * or restricted key, an account Stripe refuses, an amount below Stripe's
     * minimum — every other error — is not "unavailable": it keeps the
     * ordinary 503, so a broken set-up never quietly turns every portal
     * booking into an unpaid one.
     */
    public static function isStripeUnreachable(?\Throwable $e): bool
    {
        for ($depth = 0; $e !== null && $depth < 5; $depth++, $e = $e->getPrevious()) {
            if ($e instanceof \Stripe\Exception\ApiConnectionException || $e instanceof \Stripe\Exception\RateLimitException) {
                return true;
            }
            if ($e instanceof \Stripe\Exception\ApiErrorException && (int) $e->getHttpStatus() >= 500) {
                return true;
            }
        }

        return false;
    }

    /**
     * The target string of one appointment booking: the service, its stored
     * (venue wall-clock) start, and the Pay visit's own Idempotency-Key. The
     * key makes a grant good for exactly one booking — the confirm sends the
     * same key (a replay of it answers the booking it made), and a confirm
     * under any other key is not covered.
     */
    public static function serviceTarget(int $serviceId, string $storedStart, string $idempotencyKey): string
    {
        return $serviceId . '|' . $storedStart . '|' . $idempotencyKey;
    }

    /** The Pay visit's Idempotency-Key from a request, when it is one the confirm would accept (8–80 characters), else null. */
    public static function visitKey(?string $header): ?string
    {
        $key = trim((string) $header);

        return strlen($key) >= 8 && strlen($key) <= 80 ? $key : null;
    }
}
