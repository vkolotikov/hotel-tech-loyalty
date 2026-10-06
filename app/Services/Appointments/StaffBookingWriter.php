<?php

namespace App\Services\Appointments;

use App\Models\AuditLog;
use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceMaster;
use App\Models\User;
use App\Services\Appointments\Money\StaffPricing;
use App\Services\Booking\CouponException;
use App\Services\Booking\CouponSelection;
use App\Services\ServiceSchedulingService;
use App\Support\AdvisoryLock;
use Carbon\CarbonImmutable;

/**
 * The one place the appointments workspace writes a booking's time.
 *
 * Same rules as every other entry point: the per-person advisory lock
 * (`svcm:{master}`) is taken first, the scheduler's reserveSlot() decides
 * inside it, and the row is written in the same transaction. What this adds
 * for staff: the booking carries its client and member, a retry with the
 * same Idempotency-Key answers with the first booking, and the audit row
 * names who did it.
 */
final class StaffBookingWriter
{
    /** `service_booking_submissions.source` for this entry point. */
    public const SOURCE = 'staff';

    /** A length staff set for one booking (Part F): 15 minutes to 8 hours, in 15-minute steps. */
    public const LENGTH_MIN = 15;
    public const LENGTH_MAX = 480;
    public const LENGTH_STEP = 15;

    public function __construct(private readonly ServiceSchedulingService $scheduler, private readonly StaffPricing $pricing)
    {
    }

    /**
     * @param array{client_id: int, service_id: int, master_id: int, start: string, source?: ?string, customer_notes?: ?string, staff_notes?: ?string, coupon?: ?array, expected_total?: ?float} $data
     * @return array{booking: ServiceBooking, replayed: bool}
     */
    public function create(array $data, string $key, User $actor): array
    {
        $orgId = (int) app('current_organization_id');
        $hash = hash('sha256', (string) json_encode([
            'client_id'      => (int) $data['client_id'],
            'service_id'     => (int) $data['service_id'],
            'master_id'      => (int) $data['master_id'],
            'start'          => (string) $data['start'],
            'source'         => (string) ($data['source'] ?? 'admin'),
            'customer_notes' => (string) ($data['customer_notes'] ?? ''),
            'staff_notes'    => (string) ($data['staff_notes'] ?? ''),
            'coupon'         => $data['coupon'] ?? null,
            'expected_total' => isset($data['expected_total']) ? round((float) $data['expected_total'], 2) : null,
        ]));

        // A retry of a request that already succeeded must answer with that
        // booking, whatever has happened to the slot or the clock since.
        if ($replay = $this->replay($orgId, $key, $hash)) {
            return $replay;
        }

        $guest = Guest::find($data['client_id'])
            ?? throw new AppointmentRefused('client_not_found', 'This client no longer exists.', 404);
        $service = Service::where('is_active', true)->find($data['service_id'])
            ?? throw new AppointmentRefused('service_not_found', 'This service no longer exists.', 404);
        $master = ServiceMaster::where('is_active', true)->find($data['master_id'])
            ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
        $this->assertPerforms($master, $service);
        $start = $this->startOrRefuse((string) $data['start'], $orgId);

        try {
            return AdvisoryLock::transaction("svcm:{$master->id}", function () use ($data, $key, $hash, $orgId, $guest, $service, $master, $start, $actor) {
                // Again, now that this request holds the lock: a second request
                // with the same key ran its first lookup before the first
                // committed, then waited here.
                if ($replay = $this->replay($orgId, $key, $hash)) {
                    return $replay;
                }

                $slot = $this->scheduler->reserveSlot($service, $master->id, $start->toIso8601String());

                // Part E: the portal's own member price and the member's chosen coupon, checked against what staff saw.
                try {
                    $pricing = $this->pricing->price($guest, (float) $slot['price'], $service->currency ?: 'EUR', CouponSelection::fromArray($data['coupon'] ?? null));
                } catch (CouponException $e) {
                    throw new AppointmentRefused($e->errorCode, $e->sentence(), 422);
                }
                if (isset($data['expected_total']) && abs($pricing->total - (float) $data['expected_total']) > 0.004) {
                    throw new AppointmentRefused('price_changed', 'The price changed — check it and save again.', 409, ['quote' => $pricing->toArray()]);
                }

                $booking = ServiceBooking::create([
                    'organization_id'   => $orgId,
                    'service_id'        => $service->id,
                    'service_master_id' => $slot['master']->id,
                    'guest_id'          => $guest->id,
                    // Resolved through the tenant scope: a member id that is
                    // not this organisation's resolves to null.
                    'member_id'         => $guest->member_id ? LoyaltyMember::whereKey($guest->member_id)->value('id') : null,
                    'customer_name'     => (string) $guest->full_name,
                    // The column is NOT NULL; a client without an email is stored as ''.
                    'customer_email'    => (string) ($guest->email ?? ''),
                    'customer_phone'    => $guest->phone ?: ($guest->mobile ?: null),
                    'party_size'        => 1,
                    'start_at'          => $slot['start'],
                    'end_at'            => $slot['end'],
                    'duration_minutes'  => $slot['duration_minutes'],
                    'service_price'     => $slot['price'],
                    'extras_total'      => 0,
                    'currency'          => $service->currency ?: 'EUR',
                    'status'            => 'confirmed',
                    'payment_status'    => 'unpaid',
                    'source'            => $data['source'] ?? 'admin',
                    'customer_notes'    => $data['customer_notes'] ?? null,
                    'staff_notes'       => $data['staff_notes'] ?? null,
                    // list_amount, discount_*, total_amount (Part E)
                    ...$this->pricing->columns($pricing),
                ]);

                ServiceBookingSubmission::create([
                    'organization_id'    => $orgId,
                    'idempotency_key'    => $key,
                    'source'             => self::SOURCE,
                    'outcome'            => 'success',
                    'service_booking_id' => $booking->id,
                    'customer_email'     => $guest->email ?: null,
                    'customer_name'      => (string) $guest->full_name,
                    'request_payload'    => ['_hash' => $hash, 'actor_id' => $actor->id],
                ]);

                // The member's coupon is used here, in the same transaction; a replay never reaches this line.
                $this->pricing->consume($pricing, $booking->booking_reference);

                AuditLog::record(
                    'service_booking.created',
                    $booking,
                    [
                        'start'      => VenueClock::wall($booking->start_at),
                        'end'        => VenueClock::wall($booking->end_at),
                        'master_id'  => (int) $booking->service_master_id,
                        'service_id' => (int) $booking->service_id,
                        'client_id'  => (int) $guest->id,
                        'status'     => 'confirmed',
                    ],
                    [],
                    $actor,
                    "Created appointment {$booking->booking_reference} for {$booking->customer_name}",
                );

                return ['booking' => $booking, 'replayed' => false];
            });
        } catch (AppointmentRefused $e) {
            throw $e;
        } catch (\PDOException $e) {
            // A database failure is a \RuntimeException too; it must not be
            // reported to staff as "that time is taken".
            throw $e;
        } catch (\RuntimeException) {
            throw new AppointmentRefused('slot_taken', "That time is not free for {$master->name}. Choose another.", 409);
        }
    }

    /**
     * Move an appointment to another time and/or person. It keeps its
     * reference, service, price, payment and links; the duration is the new
     * person's. The scheduler leaves the appointment's own row out of the
     * conflict check.
     *
     * Lock order: the target person's `svcm:` lock, then the booking row.
     *
     * $length (Part F) becomes the booking's own length (meta.length_minutes) and later moves keep it;
     * $normalLength forgets it, so the new person's normal length applies again.
     */
    public function move(int $id, string $wall, int $masterId, string $revision, User $actor, ?int $length = null, bool $normalLength = false): ServiceBooking
    {
        $orgId = (int) app('current_organization_id');
        $length = self::lengthOrRefuse($length, $normalLength);

        // The booking first, outside the lock, only to answer 404 before
        // anything else can refuse; everything is read again under the lock.
        if (!ServiceBooking::whereKey($id)->exists()) {
            throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);
        }
        $master = ServiceMaster::where('is_active', true)->find($masterId)
            ?? throw new AppointmentRefused('master_not_found', 'This team member no longer exists.', 404);
        $start = $this->startOrRefuse($wall, $orgId);

        try {
            return AdvisoryLock::transaction("svcm:{$master->id}", function () use ($id, $master, $start, $revision, $actor, $length, $normalLength) {
                $booking = ServiceBooking::lockForUpdate()->find($id)
                    ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

                StaleAppointment::unless($booking, $revision);

                if (!in_array((string) $booking->status, AppointmentActions::MOVABLE, true)) {
                    throw new AppointmentRefused('not_allowed', "A {$booking->status} appointment cannot be moved.", 422);
                }

                $service = Service::find($booking->service_id)
                    ?? throw new AppointmentRefused('service_not_found', 'This appointment\'s service no longer exists.', 422);
                $this->assertPerforms($master, $service);

                // Part F: a length staff set stays with the booking until changed or forgotten.
                $meta = (array) ($booking->meta ?? []);
                $kept = isset($meta['length_minutes']) ? (int) $meta['length_minutes'] : null;
                $use = $normalLength ? null : ($length ?? $kept);

                $slot = $this->scheduler->reserveSlot($service, $master->id, $start->toIso8601String(), $booking->id, $use);

                $old = [
                    'start'     => VenueClock::wall($booking->start_at),
                    'end'       => VenueClock::wall($booking->end_at),
                    'master_id' => (int) $booking->service_master_id,
                    'length'    => (int) $booking->duration_minutes,
                ];

                if ($normalLength) {
                    unset($meta['length_minutes']);
                } elseif ($length !== null) {
                    $meta['length_minutes'] = $length;
                }

                $booking->update([
                    'start_at'          => $slot['start'],
                    'end_at'            => $slot['end'],
                    'duration_minutes'  => $slot['duration_minutes'],
                    'service_master_id' => $slot['master']->id,
                    'meta'              => $meta === [] ? null : $meta,
                ]);

                AuditLog::record(
                    'service_booking.moved',
                    $booking,
                    [
                        'start'     => VenueClock::wall($booking->start_at),
                        'end'       => VenueClock::wall($booking->end_at),
                        'master_id' => (int) $booking->service_master_id,
                        'length'    => (int) $booking->duration_minutes,
                    ],
                    $old,
                    $actor,
                    "Moved appointment {$booking->booking_reference} to " . VenueClock::wall($booking->start_at) . " with {$master->name} ({$booking->duration_minutes} min)",
                );

                return $booking;
            });
        } catch (\PDOException $e) {
            throw $e;
        } catch (\RuntimeException) {
            throw new AppointmentRefused('slot_taken', "That time is not free for {$master->name}. Choose another.", 409);
        }
    }

    /** A staff-set length, or null for none. A length out of the rules, or one sent with `normal_length`, is refused. */
    public static function lengthOrRefuse(?int $length, bool $normal = false): ?int
    {
        if ($length === null) {
            return null;
        }
        if ($normal || $length < self::LENGTH_MIN || $length > self::LENGTH_MAX || $length % self::LENGTH_STEP !== 0) {
            throw new AppointmentRefused('invalid_length', 'Choose a length between 15 minutes and 8 hours, in 15-minute steps.', 422);
        }

        return $length;
    }

    /** `YYYY-MM-DDTHH:mm`, a time the venue's clock has, on the venue's today or later. */
    public function startOrRefuse(string $wall, int $orgId): CarbonImmutable
    {
        $start = VenueClock::parse($wall)
            ?? throw new AppointmentRefused('invalid_time', 'Send the start as YYYY-MM-DDTHH:mm.', 422);

        if (!VenueClock::exists($start, $orgId)) {
            throw new AppointmentRefused('time_does_not_exist', 'That time does not exist at the venue: the clocks change that night.', 422);
        }
        if ($start->format('Y-m-d') < VenueClock::today($orgId)) {
            throw new AppointmentRefused('before_today', 'An appointment cannot be placed on a day that has passed.', 422);
        }

        return $start;
    }

    public function assertPerforms(ServiceMaster $master, Service $service): void
    {
        if (!$service->masters()->where('service_masters.id', $master->id)->exists()) {
            throw new AppointmentRefused('master_not_eligible', "{$master->name} does not perform {$service->name}.", 422);
        }
    }

    /** @return array{booking: ServiceBooking, replayed: bool}|null */
    private function replay(int $orgId, string $key, string $hash): ?array
    {
        $prior = ServiceBookingSubmission::where('idempotency_key', $key)
            ->where('source', self::SOURCE)
            ->where('outcome', 'success')
            ->latest('id')
            ->first();
        if (!$prior) {
            return null;
        }
        if (($prior->request_payload['_hash'] ?? null) !== $hash) {
            throw new AppointmentRefused('idempotency_key_reused', 'This request key was already used for a different appointment.', 422);
        }

        // Without the brand scope: a retry after the operator switched brand
        // must still find the booking it made.
        $booking = ServiceBooking::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->find($prior->service_booking_id);

        return $booking ? ['booking' => $booking, 'replayed' => true] : null;
    }
}
