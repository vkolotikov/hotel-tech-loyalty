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
 * When it is on and a portal `payment-intent` call cannot get a payment
 * from Stripe, the call answers `409 pay_at_venue` (reason
 * `payment_unavailable`) together with a grant: a short-lived, encrypted
 * and signed note (Laravel's Crypt, the application key) that names the
 * organisation, the member and the very hold or slot. The confirm accepts a
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

    /** The target string of a service slot: the service and its stored (venue wall-clock) start. */
    public static function serviceTarget(int $serviceId, string $storedStart): string
    {
        return $serviceId . '|' . $storedStart;
    }
}
