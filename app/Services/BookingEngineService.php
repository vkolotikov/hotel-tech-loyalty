<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingIdempotencyKey;
use App\Models\BookingMirror;
use App\Models\BookingSubmission;
use App\Models\Guest;
use Illuminate\Support\Str;

class BookingEngineService
{
    public function __construct(private SmoobuClient $smoobu) {}

    /** Create a price quote with hold token. */
    public function quote(array $data): array
    {
        $unitId   = $data['unit_id'];
        $checkIn  = $data['check_in'];
        $checkOut = $data['check_out'];
        $adults   = $data['adults'] ?? 2;
        $children = $data['children'] ?? 0;
        $extras   = $data['extras'] ?? [];

        $units = $this->getUnitsConfig();
        $unit  = $units[$unitId] ?? null;
        if (!$unit) {
            throw new \InvalidArgumentException('Unknown unit');
        }

        $avail = app(AvailabilityService::class);
        $rates = $avail->unitRates($unitId, $checkIn, $checkOut, $adults);

        if (empty($rates) || !($rates['available'] ?? false)) {
            throw new \RuntimeException('Unit not available for selected dates');
        }

        $nights      = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
        $roomTotal   = $rates['price'] ?? ($rates['price_per_night'] ?? 0) * $nights;
        $extrasTotal = $this->calcExtras($extras, $adults);
        $grossTotal  = $roomTotal + $extrasTotal;

        $holdToken = Str::random(48);
        BookingHold::create([
            'hold_token'   => $holdToken,
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => [
                'unit_id'         => $unitId,
                'unit_name'       => $unit['name'],
                'check_in'        => $checkIn,
                'check_out'       => $checkOut,
                'nights'          => $nights,
                'adults'          => $adults,
                'children'        => $children,
                'room_total'      => $roomTotal,
                'extras'          => $extras,
                'extras_total'    => $extrasTotal,
                'gross_total'     => $grossTotal,
                'currency'        => 'EUR',
                'price_per_night' => $rates['price_per_night'] ?? round($roomTotal / $nights, 2),
            ],
        ]);

        return [
            'hold_token'      => $holdToken,
            'expires_at'      => now()->addMinutes(10)->toIso8601String(),
            'unit_id'         => $unitId,
            'unit_name'       => $unit['name'],
            'check_in'        => $checkIn,
            'check_out'       => $checkOut,
            'nights'          => $nights,
            'adults'          => $adults,
            'children'        => $children,
            'room_total'      => $roomTotal,
            'extras_total'    => $extrasTotal,
            'gross_total'     => $grossTotal,
            'currency'        => 'EUR',
            'price_per_night' => $rates['price_per_night'] ?? round($roomTotal / $nights, 2),
        ];
    }

    /** Confirm a booking from hold token. */
    public function confirm(array $data, ?string $idempotencyKey = null, ?string $requestId = null, ?string $ip = null): array
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Check idempotency
        if ($idempotencyKey && $orgId) {
            $existing = BookingIdempotencyKey::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('idempotency_key', $idempotencyKey)
                ->first();
            if ($existing && $existing->isValid()) {
                return array_merge($existing->response_json, ['replayed' => true]);
            }
        }

        $holdToken = $data['hold_token'];
        $hold      = BookingHold::where('hold_token', $holdToken)->first();

        if (!$hold || !$hold->isActive()) {
            $this->logSubmission('failure', 'hold_expired', 'Hold expired or not found', $data, $requestId, $idempotencyKey);
            throw new \RuntimeException('Hold expired or not found');
        }

        $payload = $hold->payload_json;
        $guest   = $data['guest'] ?? [];

        // Try to link or create a CRM guest
        $guestId = $this->linkOrCreateGuest($guest, $orgId);

        // Create reservation in Smoobu
        try {
            $result = $this->smoobu->createReservation([
                'arrivalApartment' => $payload['unit_id'],
                'arrival'          => $payload['check_in'],
                'departure'        => $payload['check_out'],
                'firstName'        => $guest['first_name'] ?? '',
                'lastName'         => $guest['last_name'] ?? '',
                'email'            => $guest['email'] ?? '',
                'phone'            => $guest['phone'] ?? '',
                'adults'           => $payload['adults'],
                'children'         => $payload['children'],
                'price'            => $payload['gross_total'],
                'channelId'        => $this->smoobu->channelId(),
            ]);
        } catch (\Throwable $e) {
            $this->logSubmission('failure', 'pms_error', $e->getMessage(), $data, $requestId, $idempotencyKey);
            throw $e;
        }

        // Consume hold
        $hold->update(['status' => 'consumed']);

        // Create mirror record
        BookingMirror::create([
            'reservation_id'    => (string) ($result['id'] ?? ''),
            'booking_reference' => $result['reference-id'] ?? null,
            'booking_type'      => 'reservation',
            'booking_state'     => 'confirmed',
            'apartment_id'      => $payload['unit_id'],
            'apartment_name'    => $payload['unit_name'],
            'channel_name'      => 'Website',
            'guest_id'          => $guestId,
            'guest_name'        => trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')),
            'guest_email'       => $guest['email'] ?? null,
            'guest_phone'       => $guest['phone'] ?? null,
            'adults'            => $payload['adults'],
            'children'          => $payload['children'],
            'arrival_date'      => $payload['check_in'],
            'departure_date'    => $payload['check_out'],
            'price_total'       => $payload['gross_total'],
            'internal_status'   => 'confirmed',
            'synced_at'         => now(),
        ]);

        $response = [
            'success'           => true,
            'booking_reference' => $result['reference-id'] ?? null,
            'reservation_id'    => (string) ($result['id'] ?? ''),
            'unit_name'         => $payload['unit_name'],
            'check_in'          => $payload['check_in'],
            'check_out'         => $payload['check_out'],
            'gross_total'       => $payload['gross_total'],
            'currency'          => 'EUR',
        ];

        // Save idempotency
        if ($idempotencyKey) {
            BookingIdempotencyKey::create([
                'idempotency_key' => $idempotencyKey,
                'request_hash'    => md5(json_encode($data)),
                'response_json'   => $response,
                'status_code'     => 201,
                'expires_at'      => now()->addHours(24),
            ]);
        }

        $this->logSubmission('success', null, null, array_merge($data, $response), $requestId, $idempotencyKey, $response, $guestId);

        AuditLog::create([
            'action'      => 'booking.confirmed',
            'subject_type'=> 'booking_mirror',
            'subject_id'  => $result['id'] ?? null,
            'details'     => json_encode(['booking_reference' => $response['booking_reference']]),
            'ip_address'  => $ip,
        ]);

        return $response;
    }

    /** Sync a single reservation from Smoobu into booking_mirror. */
    public function syncReservation(string $reservationId): ?BookingMirror
    {
        $data = $this->smoobu->getReservation($reservationId);
        if (empty($data)) return null;

        return $this->upsertBookingFromData($data);
    }

    /**
     * Upsert a booking mirror from already-fetched Smoobu data (no extra API call).
     */
    public function upsertBookingFromData(array $data): ?BookingMirror
    {
        if (empty($data['id'])) return null;

        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        $guestEmail = $data['email'] ?? null;
        $guestId    = null;
        if ($guestEmail) {
            $guest = Guest::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('email', $guestEmail)
                ->first();
            $guestId = $guest?->id;
        }

        // Helper: Smoobu returns "Yes"/"No"/"YES" strings for paid statuses
        $toBool = fn($v) => is_string($v) ? strtolower($v) === 'yes' : (bool) $v;

        // Smoobu price-paid is "Yes"/"No" → convert to numeric (full price if paid, 0 if not)
        $pricePaidRaw = $data['price-paid'] ?? null;
        $priceTotal = $data['price'] ?? 0;
        $pricePaid = ($pricePaidRaw && $toBool($pricePaidRaw)) ? $priceTotal : 0;

        // Derive payment status from Smoobu data
        $isBlocked = $data['is-blocked-booking'] ?? false;
        if ($isBlocked) {
            $paymentStatus = null;
        } elseif ($pricePaid >= $priceTotal && $priceTotal > 0) {
            $paymentStatus = 'paid';
        } elseif ($pricePaid > 0 && $pricePaid < $priceTotal) {
            $paymentStatus = 'pending';
        } else {
            $paymentStatus = 'open';
        }

        // Smoobu list uses 'type' field (reservation/cancellation), not numeric 'status'
        $type = $data['type'] ?? 'reservation';
        $bookingState = match ($type) {
            'cancellation'            => 'cancelled',
            'modification of booking' => 'confirmed',
            default                   => 'confirmed',
        };

        // Derive internal_status from booking state + dates
        $arrivalDate = $data['arrival'] ?? null;
        $departureDate = $data['departure'] ?? null;
        $today = now()->toDateString();
        if ($type === 'cancellation') {
            $internalStatus = 'cancelled';
        } elseif ($departureDate && $departureDate < $today) {
            $internalStatus = 'checked-out';
        } elseif ($arrivalDate && $arrivalDate <= $today && $departureDate && $departureDate >= $today) {
            $internalStatus = 'checked-in';
        } else {
            $internalStatus = 'confirmed';
        }

        return BookingMirror::updateOrCreate(
            ['organization_id' => $orgId, 'reservation_id' => (string) $data['id']],
            [
                'booking_reference'  => $data['reference-id'] ?? null,
                'booking_type'       => $type,
                'booking_state'      => $bookingState,
                'apartment_id'       => $data['apartment']['id'] ?? null,
                'apartment_name'     => $data['apartment']['name'] ?? null,
                'channel_id'         => $data['channel']['id'] ?? null,
                'channel_name'       => $data['channel']['name'] ?? null,
                'guest_id'           => $guestId,
                'guest_name'         => $data['guest-name'] ?? null,
                'guest_email'        => $data['email'] ?? null,
                'guest_phone'        => $data['phone'] ?? null,
                'guest_language'     => $data['language'] ?? null,
                'adults'             => $data['adults'] ?? null,
                'children'           => $data['children'] ?? null,
                'arrival_date'       => $arrivalDate,
                'departure_date'     => $departureDate,
                'check_in_time'      => $data['check-in'] ?? null,
                'check_out_time'     => $data['check-out'] ?? null,
                'notice'             => $data['notice'] ?? null,
                'guest_app_url'      => $data['guest-app-url'] ?? null,
                'price_total'        => $priceTotal,
                'price_paid'         => $pricePaid,
                'prepayment_amount'  => $data['prepayment'] ?? null,
                'prepayment_paid'    => $toBool($data['prepayment-paid'] ?? false),
                'deposit_amount'     => $data['deposit'] ?? null,
                'deposit_paid'       => $toBool($data['deposit-paid'] ?? false),
                'payment_status'     => $paymentStatus,
                'internal_status'    => $internalStatus,
                'source_created_at'  => $data['created-at'] ?? null,
                'source_updated_at'  => $data['modified-at'] ?? $data['modifiedAt'] ?? null,
                'synced_at'          => now(),
                'raw_json'           => $data,
            ]
        );
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function linkOrCreateGuest(array $guestData, ?int $orgId): ?int
    {
        $email = $guestData['email'] ?? null;
        if (!$email || !$orgId) return null;

        $guest = Guest::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('email', $email)
            ->first();

        if ($guest) return $guest->id;

        $firstName = $guestData['first_name'] ?? '';
        $lastName  = $guestData['last_name'] ?? '';

        $guest = Guest::withoutGlobalScopes()->create([
            'organization_id' => $orgId,
            'first_name'      => $firstName,
            'last_name'       => $lastName,
            'full_name'       => trim("{$firstName} {$lastName}"),
            'email'           => $email,
            'phone'           => $guestData['phone'] ?? null,
            'guest_type'      => 'Individual',
            'lead_source'     => 'Booking Engine',
        ]);

        return $guest->id;
    }

    private function calcExtras(array $extras, int $adults): float
    {
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', app()->bound('current_organization_id') ? app('current_organization_id') : null)
            ->where('key', 'booking_extras')
            ->value('value');

        $allExtras = $json ? collect(json_decode($json, true)) : collect(config('booking.extras', []));
        $total     = 0.0;

        foreach ($extras as $item) {
            $extraId = $item['id'] ?? '';
            $qty     = $item['quantity'] ?? 1;
            $def     = $allExtras->firstWhere('id', $extraId);
            if (!$def) continue;

            $price = $def['price'];
            if (($def['type'] ?? 'per_stay') === 'per_guest') {
                $total += $price * $adults * $qty;
            } else {
                $total += $price * $qty;
            }
        }

        return $total;
    }

    private function logSubmission(string $outcome, ?string $failCode, ?string $failMsg, array $data, ?string $requestId, ?string $idempotencyKey, array $response = [], ?int $guestId = null): void
    {
        $payload = $data['hold_token'] ?? null ? ($data['hold'] ?? []) : [];
        $guest   = $data['guest'] ?? [];

        BookingSubmission::create([
            'request_id'        => $requestId,
            'idempotency_key'   => $idempotencyKey,
            'outcome'           => $outcome,
            'failure_code'      => $failCode,
            'failure_message'   => $failMsg,
            'booking_reference' => $response['booking_reference'] ?? null,
            'reservation_id'    => $response['reservation_id'] ?? null,
            'guest_id'          => $guestId,
            'guest_name'        => trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')),
            'guest_email'       => $guest['email'] ?? null,
            'guest_phone'       => $guest['phone'] ?? null,
            'unit_id'           => $payload['unit_id'] ?? $data['unit_id'] ?? null,
            'unit_name'         => $payload['unit_name'] ?? null,
            'check_in'          => $payload['check_in'] ?? null,
            'check_out'         => $payload['check_out'] ?? null,
            'adults'            => $payload['adults'] ?? null,
            'children'          => $payload['children'] ?? null,
            'gross_total'       => $payload['gross_total'] ?? $response['gross_total'] ?? null,
            'payment_method'    => $data['payment_method'] ?? null,
            'payload_json'      => $data,
        ]);
    }

    private function mapBookingState($status): string
    {
        return match ($status) {
            1       => 'confirmed',
            2       => 'cancelled',
            default => 'new',
        };
    }

    private function getUnitsConfig(): array
    {
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', app()->bound('current_organization_id') ? app('current_organization_id') : null)
            ->where('key', 'booking_units')
            ->value('value');

        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded) && !empty($decoded)) return $decoded;
        }

        return config('booking.units', []);
    }
}
