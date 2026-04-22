<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceExtra;
use App\Models\ServiceBookingExtra;
use App\Services\RealtimeEventService;
use App\Services\ServiceSchedulingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Member-initiated service (spa / wellness) booking.
 *
 * Mirrors Admin\ServiceBookingController::store() but auto-fills customer
 * fields from the authenticated member. Members cannot book on behalf of
 * someone else — customer_name/email/phone come from the user record,
 * never the request body.
 *
 * Status defaults to `pending` so the front desk approves before the slot
 * is fully confirmed (admin-created defaults to `confirmed`). This keeps
 * parity with the Book a Stay flow's "Pending → staff confirms" model.
 */
class MemberServiceBookingController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
    ) {}

    public function store(Request $request, ServiceSchedulingService $scheduler): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember;

        if (!$member) {
            return response()->json(['message' => 'No loyalty profile attached to this account.'], 422);
        }

        $data = $request->validate([
            'service_id'        => 'required|integer|exists:services,id',
            'service_master_id' => 'nullable|integer|exists:service_masters,id',
            'party_size'        => 'nullable|integer|min:1|max:20',
            'start_at'          => 'required|date|after:now',
            'customer_notes'    => 'nullable|string|max:2000',
            'extras'            => 'nullable|array',
            'extras.*.id'       => 'required_with:extras|integer|exists:service_extras,id',
            'extras.*.quantity' => 'nullable|integer|min:1|max:10',
        ]);

        $service = Service::where('organization_id', $user->organization_id)
            ->findOrFail($data['service_id']);

        // Same per-master advisory lock pattern as the admin endpoint —
        // prevents two members (or a member + admin) racing for the same
        // slot.
        $lockKey = !empty($data['service_master_id'])
            ? "svcm:{$data['service_master_id']}"
            : "svc:{$service->id}";

        try {
            $booking = DB::transaction(function () use ($data, $service, $scheduler, $user, $member, $lockKey) {
                DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$lockKey]);

                $reservation = $scheduler->reserveSlot(
                    $service,
                    $data['service_master_id'] ?? null,
                    $data['start_at'],
                );

                $partySize = (int) ($data['party_size'] ?? 1);
                $servicePrice = (float) $reservation['price'];

                $extrasTotal = 0;
                $extraRows = [];
                if (!empty($data['extras'])) {
                    $extraIds = collect($data['extras'])->pluck('id')->all();
                    $extraModels = ServiceExtra::whereIn('id', $extraIds)->get()->keyBy('id');
                    foreach ($data['extras'] as $line) {
                        $extra = $extraModels->get($line['id']);
                        if (!$extra) continue;
                        $qty = (int) ($line['quantity'] ?? 1);
                        $multiplier = $extra->price_type === 'per_person' ? $partySize * $qty : $qty;
                        $lineTotal = round((float) $extra->price * $multiplier, 2);
                        $extrasTotal += $lineTotal;
                        $extraRows[] = [
                            'extra'      => $extra,
                            'quantity'   => $qty,
                            'line_total' => $lineTotal,
                        ];
                    }
                }

                $booking = ServiceBooking::create([
                    'organization_id'   => $user->organization_id,
                    'service_id'        => $service->id,
                    'service_master_id' => $reservation['master']->id,
                    'customer_name'     => $user->name ?? 'Member',
                    'customer_email'    => $user->email,
                    'customer_phone'    => $user->phone ?? null,
                    'party_size'        => $partySize,
                    'start_at'          => $reservation['start'],
                    'end_at'            => $reservation['end'],
                    'duration_minutes'  => $reservation['duration_minutes'],
                    'service_price'     => $servicePrice,
                    'extras_total'      => $extrasTotal,
                    'total_amount'      => round($servicePrice + $extrasTotal, 2),
                    'currency'          => $service->currency ?: 'EUR',
                    'status'            => 'pending',   // staff confirms
                    'payment_status'    => 'unpaid',
                    'source'            => 'mobile_app',
                    'customer_notes'    => $data['customer_notes'] ?? null,
                ]);

                foreach ($extraRows as $row) {
                    ServiceBookingExtra::create([
                        'organization_id'    => $user->organization_id,
                        'service_booking_id' => $booking->id,
                        'service_extra_id'   => $row['extra']->id,
                        'name'               => $row['extra']->name,
                        'unit_price'         => $row['extra']->price,
                        'quantity'           => $row['quantity'],
                        'line_total'         => $row['line_total'],
                    ]);
                }

                return $booking;
            });
        } catch (\RuntimeException $e) {
            // reserveSlot lost the race to a concurrent confirm.
            return response()->json(['message' => $e->getMessage()], 409);
        }

        $this->realtime->dispatch(
            'service_booking',
            'New Member Service Booking',
            "Mobile booking from {$booking->customer_name} — {$service->name}",
            [
                'id'              => $booking->id,
                'reference'       => $booking->booking_reference,
                'service'         => $service->name,
                'customer_name'   => $booking->customer_name,
                'start_at'        => $booking->start_at,
                'total_amount'    => $booking->total_amount,
                'source'          => 'mobile_app',
            ]
        );

        return response()->json($booking->fresh(['service', 'master', 'extras']), 201);
    }
}
