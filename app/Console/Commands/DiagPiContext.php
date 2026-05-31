<?php

namespace App\Console\Commands;

use App\Models\BookingHold;
use App\Models\BookingRoom;
use App\Models\Organization;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Pull together everything we know about a single Stripe PaymentIntent
 * so the operator can manually re-create the matching Smoobu reservation
 * (when our /confirm path lost the booking after Stripe captured funds).
 *
 * Output covers:
 *   1. The PI itself — status / amount / currency / created / metadata
 *   2. The active (or expired) BookingHold matched via metadata.hold_token
 *   3. The unit — booking_rooms row + Smoobu apartment id + channel
 *   4. Dates + nights
 *   5. Guest details (first/last/email/phone)
 *   6. Price breakdown from quote (base, extras, total)
 *   7. The equivalent Smoobu createReservation payload (ready to copy/paste
 *      into Postman if the operator wants to hand-recreate it)
 *
 * Footer prints the Smoobu admin URL + the exact follow-up commands the
 * operator should run after the manual recreate.
 *
 * Read-only. Safe on prod.
 *
 * Usage:
 *   php artisan diag:pi-context pi_3OabcdEf --org=12
 *   php artisan diag:pi-context pi_3OabcdEf --org=12 --json
 */
class DiagPiContext extends Command
{
    protected $signature = 'diag:pi-context
                            {intent_id : Stripe PaymentIntent id (pi_…)}
                            {--org= : Organization id (required)}
                            {--json : Emit machine-readable JSON}';

    protected $description = 'Reconstruct booking context for a Stripe PI so staff can manually recover an orphan.';

    public function handle(StripeService $stripe, SmoobuClient $smoobu): int
    {
        $intentId = (string) $this->argument('intent_id');
        $orgId = (int) $this->option('org');

        if (!$intentId || !str_starts_with($intentId, 'pi_')) {
            $this->error('A valid PaymentIntent id (pi_…) is required.');
            return self::FAILURE;
        }
        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant so StripeService::boot() loads THIS org's per-tenant
        // Stripe secret + SmoobuClient picks up the right credentials.
        app()->instance('current_organization_id', $orgId);

        if (!$stripe->isEnabled()) {
            $this->error("Stripe is not configured / not enabled for org {$orgId}.");
            return self::FAILURE;
        }

        // ── 1. Retrieve the PI ────────────────────────────────────────
        try {
            $pi = $stripe->retrievePaymentIntent($intentId);
        } catch (\Throwable $e) {
            $this->error("Stripe retrieve failed: " . $e->getMessage());
            return self::FAILURE;
        }

        $metadata = [];
        if (isset($pi->metadata)) {
            $meta = $pi->metadata;
            if (is_object($meta) && method_exists($meta, 'toArray')) {
                $metadata = $meta->toArray();
            } elseif (is_object($meta)) {
                $metadata = get_object_vars($meta);
            } elseif (is_array($meta)) {
                $metadata = $meta;
            }
        }
        $holdToken = $metadata['hold_token'] ?? null;

        // ── 2. Look up the BookingHold ────────────────────────────────
        $hold = null;
        if ($holdToken) {
            $hold = BookingHold::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('hold_token', $holdToken)
                ->first();
        }

        $payload = $hold?->payload_json ?? [];

        // ── 3. Resolve unit (booking_rooms row + Smoobu apartment id) ──
        $unitInfo = null;
        $unitIds = [];
        if (!empty($payload['unit_ids']) && is_array($payload['unit_ids'])) {
            $unitIds = $payload['unit_ids'];
        } elseif (!empty($payload['unit_id'])) {
            $unitIds = [$payload['unit_id']];
        } elseif (!empty($metadata['unit_id'])) {
            $unitIds = [$metadata['unit_id']];
        }

        $rooms = [];
        foreach ($unitIds as $uid) {
            $room = BookingRoom::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where(function ($q) use ($uid) {
                    $q->where('pms_id', (string) $uid)->orWhere('id', (int) $uid);
                })
                ->first();
            $rooms[] = [
                'unit_id'      => (string) $uid,
                'room_db_id'   => $room?->id,
                'room_name'    => $room?->name ?? ($payload['unit_name'] ?? null),
                'pms_id'       => $room?->pms_id,
                'max_guests'   => $room?->max_guests,
                'base_price'   => $room ? (float) $room->base_price : null,
            ];
        }

        // ── 4. Dates ──────────────────────────────────────────────────
        $checkIn = $payload['check_in'] ?? ($metadata['check_in'] ?? null);
        $checkOut = $payload['check_out'] ?? ($metadata['check_out'] ?? null);
        $nights = $payload['nights'] ?? (($checkIn && $checkOut)
            ? max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400))
            : null);

        // ── 5. Guest ──────────────────────────────────────────────────
        $guest = $payload['guest'] ?? [];

        // ── 6. Price breakdown ────────────────────────────────────────
        $priceBreakdown = [
            'base_price' => $payload['base_price'] ?? null,
            'extras'     => $payload['extras'] ?? [],
            'subtotal'   => $payload['subtotal'] ?? null,
            'taxes'      => $payload['taxes'] ?? null,
            'gross_total' => $payload['gross_total'] ?? null,
            'currency'   => $payload['currency'] ?? strtoupper((string) ($pi->currency ?? 'EUR')),
        ];

        // ── 7. Smoobu createReservation equivalent payload ────────────
        $smoobuChannelId = $smoobu->resolveDirectChannelId();
        $smoobuPayload = $this->buildSmoobuPayload(
            $unitIds[0] ?? null,
            $checkIn,
            $checkOut,
            $guest,
            $payload,
            $smoobuChannelId,
        );

        $result = [
            'pi' => [
                'id'         => (string) $pi->id,
                'status'     => (string) ($pi->status ?? ''),
                'amount'     => (int) ($pi->amount ?? 0),
                'amount_major' => round(((int) ($pi->amount ?? 0)) / 100, 2),
                'currency'   => strtoupper((string) ($pi->currency ?? '')),
                'created_at' => isset($pi->created) ? date('c', (int) $pi->created) : null,
                'metadata'   => $metadata,
            ],
            'hold' => [
                'found'      => $hold !== null,
                'hold_token' => $holdToken,
                'status'     => $hold?->status,
                'expires_at' => $hold?->expires_at?->toIso8601String(),
            ],
            'rooms'       => $rooms,
            'dates'       => [
                'check_in'  => $checkIn,
                'check_out' => $checkOut,
                'nights'    => $nights,
                'adults'    => $payload['adults'] ?? null,
                'children'  => $payload['children'] ?? null,
            ],
            'guest'       => [
                'first_name' => $guest['first_name'] ?? null,
                'last_name'  => $guest['last_name'] ?? null,
                'email'      => $guest['email'] ?? null,
                'phone'      => $guest['phone'] ?? null,
            ],
            'price'       => $priceBreakdown,
            'smoobu_payload' => $smoobuPayload,
            'smoobu_channel_id_resolved' => $smoobuChannelId,
        ];

        if ($this->option('json')) {
            $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            return self::SUCCESS;
        }

        // ── Pretty print ─────────────────────────────────────────────
        $this->info('═══ Stripe PaymentIntent ═══');
        $this->table(['Field', 'Value'], [
            ['ID',         $result['pi']['id']],
            ['Status',     $this->colorStatus($result['pi']['status'])],
            ['Amount',     $result['pi']['amount_major'] . ' ' . $result['pi']['currency']],
            ['Created',    $result['pi']['created_at']],
            ['hold_token', $holdToken ?: '— (not in metadata)'],
        ]);

        $this->newLine();
        $this->info('═══ Booking Hold ═══');
        if (!$hold) {
            $this->warn('No matching BookingHold row. Hold may have been pruned (>24h old) or the PI metadata is missing hold_token.');
            $this->warn('Manual recovery will need data from the Stripe receipt + customer support contact.');
        } else {
            $this->table(['Field', 'Value'], [
                ['Token',      $hold->hold_token],
                ['Status',     $hold->status],
                ['Expires at', $hold->expires_at?->toDateTimeString()],
            ]);
        }

        $this->newLine();
        $this->info('═══ Unit(s) ═══');
        if (empty($rooms)) {
            $this->warn('No unit context found — payload missing unit_id.');
        } else {
            $unitRows = [];
            foreach ($rooms as $r) {
                $unitRows[] = [
                    $r['unit_id'],
                    $r['room_name'] ?: '— (room not in DB)',
                    $r['pms_id'] ?: '—',
                    $r['max_guests'] ?? '?',
                    $r['base_price'] !== null ? number_format((float) $r['base_price'], 2) : '?',
                ];
            }
            $this->table(['unit_id', 'Name', 'Smoobu PMS id', 'Max guests', 'Base price'], $unitRows);
        }

        $this->newLine();
        $this->info('═══ Dates ═══');
        $this->table(['Field', 'Value'], [
            ['Check-in',  $checkIn ?: '?'],
            ['Check-out', $checkOut ?: '?'],
            ['Nights',    $nights ?? '?'],
            ['Adults',    $result['dates']['adults'] ?? '?'],
            ['Children',  $result['dates']['children'] ?? 0],
        ]);

        $this->newLine();
        $this->info('═══ Guest ═══');
        $this->table(['Field', 'Value'], [
            ['First name', $result['guest']['first_name'] ?? '?'],
            ['Last name',  $result['guest']['last_name'] ?? '?'],
            ['Email',      $result['guest']['email'] ?? '?'],
            ['Phone',      $result['guest']['phone'] ?? '—'],
        ]);

        $this->newLine();
        $this->info('═══ Price breakdown ═══');
        $this->table(['Field', 'Value'], [
            ['Base price',  $priceBreakdown['base_price'] ?? '?'],
            ['Extras count', is_array($priceBreakdown['extras']) ? count($priceBreakdown['extras']) : 0],
            ['Subtotal',    $priceBreakdown['subtotal'] ?? '?'],
            ['Taxes',       $priceBreakdown['taxes'] ?? '?'],
            ['Gross total', ($priceBreakdown['gross_total'] ?? '?') . ' ' . $priceBreakdown['currency']],
        ]);

        if (is_array($priceBreakdown['extras']) && !empty($priceBreakdown['extras'])) {
            $this->newLine();
            $this->info('Extras detail:');
            $this->line(json_encode($priceBreakdown['extras'], JSON_PRETTY_PRINT));
        }

        $this->newLine();
        $this->info('═══ Smoobu createReservation payload (copy/paste-ready) ═══');
        $this->line('Channel id resolved: ' . $smoobuChannelId . ($smoobuChannelId === 0 ? ' (⚠ no usable channel — see SmoobuClient::resolveDirectChannelId)' : ''));
        $this->newLine();
        $this->line(json_encode($smoobuPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        $this->newLine();
        $this->warn('Manual recovery steps:');
        $this->line('  1. Sign into Smoobu: https://login.smoobu.com/en/dashboard');
        $this->line('  2. Create a reservation matching the details above (apartment + dates + guest).');
        $this->line('  3. Pull the new reservation id from Smoobu.');
        $this->line('  4. Run:    php artisan bookings:sync-pms --org=' . $orgId);
        $this->line('  5. Then:   php artisan booking:reconcile-orphan-pi ' . $intentId . ' --org-id=' . $orgId . ' --apply');
        $this->line('  6. Optional probe: php artisan diag:smoobu-create-probe --org=' . $orgId
            . ' --apartment-id=' . ($rooms[0]['pms_id'] ?? '<N>')
            . ' --from=' . ($checkIn ?? 'YYYY-MM-DD')
            . ' --to=' . ($checkOut ?? 'YYYY-MM-DD'));

        return self::SUCCESS;
    }

    /**
     * Build the canonical Smoobu createReservation body we WOULD send
     * if /confirm ran cleanly. Mirrors BookingEngineService::confirm()
     * without actually contacting Smoobu — staff can copy this verbatim
     * into Postman or paste it as a hand-built reservation in Smoobu's
     * admin if needed.
     */
    private function buildSmoobuPayload(
        ?string $unitId,
        ?string $checkIn,
        ?string $checkOut,
        array $guest,
        array $payload,
        int $channelId,
    ): array {
        return [
            'arrivalDate'      => $checkIn,
            'departureDate'    => $checkOut,
            'arrivalApartment' => $unitId ? (int) $unitId : null,
            'channelId'        => $channelId,
            'firstName'        => $guest['first_name'] ?? '',
            'lastName'         => $guest['last_name'] ?? '',
            'email'            => $guest['email'] ?? '',
            'phone'            => $guest['phone'] ?? '',
            'adults'           => (int) ($payload['adults'] ?? 2),
            'children'         => (int) ($payload['children'] ?? 0),
            'price'            => (float) ($payload['gross_total'] ?? 0),
            'pricePaid'        => (float) ($payload['gross_total'] ?? 0),
            'notice'           => $payload['special_requests'] ?? '',
        ];
    }

    private function colorStatus(string $status): string
    {
        return match ($status) {
            'succeeded'                => "<fg=red>{$status}</>",
            'requires_capture',
            'requires_payment_method',
            'requires_confirmation',
            'requires_action'          => "<fg=yellow>{$status}</>",
            'canceled', 'cancelled'    => "<fg=gray>{$status}</>",
            default                    => $status,
        };
    }
}
