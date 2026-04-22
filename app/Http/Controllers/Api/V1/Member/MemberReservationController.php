<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\Property;
use App\Models\Reservation;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Member-initiated reservation creation.
 *
 * Lives under /v1/member/reservations so the mobile member app can create a
 * booking on behalf of the authenticated member. The admin equivalent is at
 * /v1/admin/reservations (staff-facing); this endpoint differs by:
 *
 *   - guest_id is resolved from the authenticated user's LoyaltyMember,
 *     NEVER accepted from the request body. Members cannot book on behalf
 *     of someone else.
 *   - Default status is 'Pending' so staff still approve before it counts
 *     as a confirmed reservation (admin side uses 'Confirmed' by default).
 *   - Room type / rate are optional — member submits preferences; staff
 *     assigns the actual room.
 */
class MemberReservationController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $member = $user->loyaltyMember;

        if (!$member) {
            return response()->json(['message' => 'No loyalty profile attached to this account.'], 422);
        }

        $v = $request->validate([
            'property_id'          => 'nullable|integer|exists:properties,id',
            'check_in'             => 'required|date|after_or_equal:today',
            'check_out'            => 'required|date|after:check_in',
            'num_rooms'            => 'nullable|integer|min:1|max:10',
            'num_adults'           => 'nullable|integer|min:1|max:20',
            'num_children'         => 'nullable|integer|min:0|max:20',
            'room_type'            => 'nullable|string|max:100',
            'special_requests'     => 'nullable|string|max:2000',
        ]);

        // Resolve or create the Guest row tied to this member. The member
        // may already have a Guest record from a prior admin-created
        // booking — reuse it so all reservations chain against the same
        // guest history.
        $guest = Guest::where('member_id', $member->id)
            ->orderBy('id', 'desc')
            ->first();

        if (!$guest) {
            $guest = Guest::create([
                'organization_id'  => $user->organization_id,
                'member_id'        => $member->id,
                'full_name'        => $user->name ?? 'Member',
                'first_name'       => explode(' ', $user->name ?? 'Member', 2)[0] ?? '',
                'last_name'        => explode(' ', $user->name ?? '', 2)[1] ?? '',
                'email'            => $user->email,
                'email_key'        => $user->email ? Guest::normalizeEmailKey($user->email) : null,
                'phone'            => $user->phone ?? null,
                'phone_key'        => $user->phone ? Guest::normalizePhoneKey($user->phone) : null,
                'guest_type'       => 'Individual',
                'lead_source'      => 'mobile_app',
                'lifecycle_status' => 'Active',
                'loyalty_tier'     => $member->tier?->name,
                'loyalty_id'       => $member->member_number,
                'last_activity_at' => now(),
            ]);
        }

        // Pick a default property if the member didn't specify one. Most
        // single-property tenants will only have one; multi-property setups
        // should have the mobile form include a property picker.
        $propertyId = $v['property_id'] ?? null;
        if (!$propertyId) {
            $propertyId = Property::where('organization_id', $user->organization_id)
                ->orderBy('id')
                ->value('id');
        }

        if (!$propertyId) {
            return response()->json(['message' => 'No property configured for this hotel.'], 422);
        }

        $property = Property::find($propertyId);
        $confNo = strtoupper($property->code ?? 'HTL')
            . '-M' . now()->format('ymd')
            . '-' . str_pad((string) $member->id, 4, '0', STR_PAD_LEFT)
            . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));

        $numNights = (int) (new \DateTime($v['check_out']))->diff(new \DateTime($v['check_in']))->days;

        $reservation = Reservation::create([
            'organization_id'  => $user->organization_id,
            'guest_id'         => $guest->id,
            'property_id'      => $propertyId,
            'confirmation_no'  => $confNo,
            'check_in'         => $v['check_in'],
            'check_out'        => $v['check_out'],
            'num_nights'       => $numNights,
            'num_rooms'        => $v['num_rooms']    ?? 1,
            'num_adults'       => $v['num_adults']   ?? 2,
            'num_children'     => $v['num_children'] ?? 0,
            'room_type'        => $v['room_type']    ?? null,
            'special_requests' => $v['special_requests'] ?? null,
            'source'           => 'Mobile App',
            'booking_channel'  => 'direct',
            // Pending so staff confirms before it counts as a booked room.
            'status'           => 'Pending',
        ]);

        $this->realtime->dispatch(
            'reservation',
            'New Member Booking',
            "Mobile booking from {$guest->full_name} — confirmation {$confNo}",
            [
                'id' => $reservation->id,
                'confirmation_no' => $confNo,
                'guest' => $guest->full_name,
                'check_in' => $v['check_in'],
                'check_out' => $v['check_out'],
                'source' => 'mobile_app',
            ]
        );

        $reservation->load('guest:id,full_name,email,phone', 'property:id,name,code');

        return response()->json($reservation, 201);
    }
}
