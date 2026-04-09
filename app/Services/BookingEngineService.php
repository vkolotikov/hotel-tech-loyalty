<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingIdempotencyKey;
use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
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

        // Create reservation in Smoobu. Field names follow the Smoobu Channel
        // Manager API contract (apartmentId / arrivalDate / departureDate /
        // channel_id). If the account doesn't have the write API enabled,
        // Smoobu returns 404 — in that case we still record the booking locally
        // as pending_pms_sync so the customer flow completes and staff can
        // reconcile in the dashboard.
        $pmsResult = null;
        $pmsError  = null;
        try {
            $pmsResult = $this->smoobu->createReservation([
                'apartmentId' => $payload['unit_id'],
                'arrivalDate' => $payload['check_in'],
                'departureDate' => $payload['check_out'],
                'channel_id'  => (int) ($this->smoobu->channelId() ?: 0),
                'firstName'   => $guest['first_name'] ?? '',
                'lastName'    => $guest['last_name'] ?? '',
                'email'       => $guest['email'] ?? '',
                'phone'       => $guest['phone'] ?? '',
                'adults'      => (int) $payload['adults'],
                'children'    => (int) $payload['children'],
                'price'       => (float) $payload['gross_total'],
                'language'    => 'en',
            ]);
        } catch (\Throwable $e) {
            $pmsError = $e->getMessage();
            \Illuminate\Support\Facades\Log::warning('Smoobu reservation create failed — falling back to local-only mirror', [
                'org_id'  => $orgId,
                'unit_id' => $payload['unit_id'],
                'error'   => $pmsError,
            ]);
            $this->logSubmission('warning', 'pms_error', $pmsError, $data, $requestId, $idempotencyKey);
        }

        $result = $pmsResult ?: [
            'id'           => 'LOCAL-' . strtoupper(\Illuminate\Support\Str::random(10)),
            'reference-id' => 'LOC-' . strtoupper(substr(md5(uniqid('', true)), 0, 8)),
        ];
        $internalStatus = $pmsResult ? 'confirmed' : 'pending_pms_sync';

        // Consume hold
        $hold->update(['status' => 'consumed']);

        // Create mirror record
        $mirror = BookingMirror::create([
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
            'internal_status'   => $internalStatus,
            'synced_at'         => $pmsResult ? now() : null,
        ]);

        // Persist line-item breakdown so admin booking detail can show the
        // accommodation row plus every extra the guest selected. Without this
        // the BookingDetail price-elements panel stays empty for direct
        // bookings made through the website widget.
        $this->persistPriceElements($mirror, $payload, $orgId);

        // Lifecycle: a confirmed widget booking is real engagement. If the
        // departure date has already passed (rare for widget but possible
        // for back-dated entries) count it as a completed stay; otherwise
        // just bump activity so the guest doesn't drift toward Inactive.
        if ($guestId) {
            $g = Guest::withoutGlobalScopes()->find($guestId);
            if ($g) {
                $lifecycle = app(GuestLifecycleService::class);
                if (strtotime($payload['check_out']) < strtotime('today')) {
                    $lifecycle->recordStay(
                        $g,
                        $payload['check_in'],
                        $payload['check_out'],
                        null,
                        (float) $payload['gross_total'],
                    );
                    $mirror->update(['lifecycle_counted_at' => now()]);
                } else {
                    $lifecycle->recordActivity($g);
                }
            }
        }

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

        $mirror = BookingMirror::updateOrCreate(
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

        // Count toward guest lifecycle the first time this mirror reaches
        // a checked-out state. lifecycle_counted_at acts as the idempotency
        // flag so re-syncing the same Smoobu reservation never double-counts.
        if (
            $guestId
            && $internalStatus === 'checked-out'
            && !$mirror->lifecycle_counted_at
        ) {
            $g = Guest::withoutGlobalScopes()->find($guestId);
            if ($g) {
                app(GuestLifecycleService::class)->recordStay(
                    $g,
                    $arrivalDate,
                    $departureDate,
                    null,
                    (float) $priceTotal,
                );
                $mirror->update(['lifecycle_counted_at' => now()]);
            }
        }

        return $mirror;
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

    /**
     * Write a BookingPriceElement row for the room and one per selected extra
     * so the admin booking detail page can render the full price breakdown.
     */
    private function persistPriceElements(BookingMirror $mirror, array $payload, ?int $orgId): void
    {
        $reservationId = (string) ($mirror->reservation_id ?? '');
        $currency      = $payload['currency'] ?? 'EUR';
        $nights        = max(1, (int) ($payload['nights'] ?? 1));
        $sortOrder     = 0;

        // Room (accommodation) line — quantity is nights so admin sees
        // "€120.00 × 3" rather than a flat lump sum.
        $perNight = (float) ($payload['price_per_night']
            ?? (($payload['room_total'] ?? 0) / max(1, $nights)));

        BookingPriceElement::create([
            'organization_id'  => $orgId,
            'booking_mirror_id'=> $mirror->id,
            'reservation_id'   => $reservationId,
            'element_type'     => 'accommodation',
            'name'             => $payload['unit_name'] ?? 'Accommodation',
            'amount'           => round($perNight, 2),
            'quantity'         => $nights,
            'currency_code'    => $currency,
            'sort_order'       => $sortOrder++,
        ]);

        // Extras: re-resolve names + per-unit amounts from the saved settings
        // so the admin sees the same labels the customer picked.
        $extras    = $payload['extras'] ?? [];
        if (empty($extras)) return;

        $adults    = (int) ($payload['adults'] ?? 1);
        $allExtras = collect($this->loadExtrasConfig());

        foreach ($extras as $item) {
            $extraId = $item['id'] ?? null;
            $qty     = max(1, (int) ($item['quantity'] ?? 1));
            $def     = $allExtras->firstWhere('id', $extraId);
            if (!$def) continue;

            $unitPrice = (float) ($def['price'] ?? 0);
            if (($def['type'] ?? 'per_stay') === 'per_guest') {
                $unitPrice *= max(1, $adults);
            }

            BookingPriceElement::create([
                'organization_id'  => $orgId,
                'booking_mirror_id'=> $mirror->id,
                'reservation_id'   => $reservationId,
                'element_type'     => 'extra',
                'name'             => $def['name'] ?? ($def['label'] ?? 'Extra'),
                'amount'           => round($unitPrice, 2),
                'quantity'         => $qty,
                'currency_code'    => $currency,
                'sort_order'       => $sortOrder++,
            ]);
        }
    }

    private function loadExtrasConfig(): array
    {
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', app()->bound('current_organization_id') ? app('current_organization_id') : null)
            ->where('key', 'booking_extras')
            ->value('value');

        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded)) return $decoded;
        }
        return config('booking.extras', []);
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

        // Hand off failed widget submissions to the unified Inquiries
        // pipeline so staff can manually rescue the booking. We need at
        // least an email to do anything useful with it.
        if ($outcome === 'failure' && !empty($guest['email'])) {
            $this->createInquiryFromFailedSubmission($guest, $payload, $failCode, $failMsg);
        }
    }

    private function createInquiryFromFailedSubmission(array $guest, array $payload, ?string $failCode, ?string $failMsg): void
    {
        try {
            $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
            if (!$orgId) return;

            // Reuse linkOrCreateGuest so the failed-submission flow goes
            // through the same auto-Bronze + lifecycle hooks as a successful
            // booking — the customer ends up in Members regardless.
            $guestId = $this->linkOrCreateGuest($guest, $orgId);
            if (!$guestId) return;

            $inquiry = \App\Models\Inquiry::create([
                'organization_id' => $orgId,
                'guest_id'        => $guestId,
                'inquiry_type'    => 'Room Reservation',
                'source'          => 'booking_widget_failed',
                'status'          => 'New',
                'priority'        => 'High',
                'check_in'        => $payload['check_in'] ?? null,
                'check_out'       => $payload['check_out'] ?? null,
                'num_adults'      => $payload['adults'] ?? null,
                'num_children'    => $payload['children'] ?? null,
                'room_type_requested' => $payload['unit_name'] ?? null,
                'total_value'     => $payload['gross_total'] ?? null,
                'notes'           => "Booking widget failed: {$failCode} — {$failMsg}",
            ]);

            // Surface a realtime toast so staff know to follow up before the
            // would-be guest goes cold. Hooks the existing realtime poll bus
            // that already drives arrival / inquiry notifications.
            try {
                $guestName = trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')) ?: ($guest['email'] ?? 'Unknown');
                $unit      = $payload['unit_name'] ?? null;
                $dates     = ($payload['check_in'] ?? null) && ($payload['check_out'] ?? null)
                    ? " ({$payload['check_in']} → {$payload['check_out']})"
                    : '';
                app(\App\Services\RealtimeEventService::class)->dispatch(
                    'inquiry',
                    'Booking widget failed — follow up',
                    "{$guestName}" . ($unit ? " · {$unit}" : '') . $dates,
                    ['inquiry_id' => $inquiry->id, 'reason' => $failCode]
                );
            } catch (\Throwable $notifyError) {
                \Illuminate\Support\Facades\Log::warning('Realtime dispatch failed for rescue inquiry', [
                    'error' => $notifyError->getMessage(),
                ]);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Failed to create rescue inquiry from booking failure', [
                'error' => $e->getMessage(),
            ]);
        }
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
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Primary: booking_rooms table
        $dbRooms = \App\Models\BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->get();

        if ($dbRooms->isNotEmpty()) {
            $result = [];
            foreach ($dbRooms as $room) {
                $key = $room->pms_id ?: (string) $room->id;
                $result[$key] = $room->toArray();
            }
            return $result;
        }

        // Fallback: legacy JSON settings
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'booking_units')
            ->value('value');

        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded) && !empty($decoded)) return $decoded;
        }

        return [];
    }
}
