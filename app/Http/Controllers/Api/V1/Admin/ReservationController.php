<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Mail\BookingConfirmationMail;
use App\Mail\BookingMembershipMail;
use App\Models\EmailVerificationCode;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\Reservation;
use App\Services\GuestLifecycleService;
use App\Services\GuestMemberLinkService;
use App\Services\RealtimeEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReservationController extends Controller
{
    public function __construct(
        protected RealtimeEventService $realtime,
        protected GuestLifecycleService $lifecycle,
    ) {}
    public function index(Request $request): JsonResponse
    {
        $query = Reservation::with(['guest:id,full_name,company,vip_level,phone,email', 'property:id,name,code', 'corporateAccount:id,company_name']);

        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('confirmation_no', 'ilike', "%$s%")
                  ->orWhere('room_number', 'ilike', "%$s%")
                  ->orWhereHas('guest', fn($q2) => $q2->where('full_name', 'ilike', "%$s%")->orWhere('company', 'ilike', "%$s%"));
            });
        }
        if ($v = $request->get('status'))          $query->where('status', $v);
        if ($v = $request->get('property_id'))     $query->where('property_id', $v);
        if ($v = $request->get('room_type'))       $query->where('room_type', $v);
        if ($v = $request->get('meal_plan'))       $query->where('meal_plan', $v);
        if ($v = $request->get('payment_status'))  $query->where('payment_status', $v);
        if ($v = $request->get('booking_channel')) $query->where('booking_channel', $v);
        if ($v = $request->get('check_in_from'))   $query->where('check_in', '>=', $v);
        if ($v = $request->get('check_in_to'))     $query->where('check_in', '<=', $v);
        if ($v = $request->get('check_out_from'))  $query->where('check_out', '>=', $v);
        if ($v = $request->get('check_out_to'))    $query->where('check_out', '<=', $v);

        if ($request->get('arrivals_today'))   $query->where('check_in', now()->toDateString())->where('status', 'Confirmed');
        if ($request->get('departures_today')) $query->where('check_out', now()->toDateString())->where('status', 'Checked In');
        if ($request->get('in_house'))         $query->where('status', 'Checked In');

        $allowedSorts = ['check_in', 'check_out', 'created_at', 'total_amount', 'status', 'room_number', 'confirmation_no'];
        $sort = in_array($request->get('sort'), $allowedSorts) ? $request->get('sort') : 'check_in';
        $dir  = $request->get('dir') === 'asc' ? 'asc' : 'desc';
        $query->orderBy($sort, $dir);

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'guest_id'             => 'required|integer|exists:guests,id',
            'inquiry_id'           => 'nullable|integer|exists:inquiries,id',
            'corporate_account_id' => 'nullable|integer|exists:corporate_accounts,id',
            'property_id'          => 'required|integer|exists:properties,id',
            'confirmation_no'      => 'nullable|string|max:50|unique:reservations,confirmation_no',
            'check_in'             => 'required|date',
            'check_out'            => 'required|date|after:check_in',
            'num_rooms'            => 'nullable|integer|min:1',
            'num_adults'           => 'nullable|integer|min:1',
            'num_children'         => 'nullable|integer|min:0',
            'room_type'            => 'nullable|string|max:100',
            'room_number'          => 'nullable|string|max:20',
            'rate_per_night'       => 'nullable|numeric|min:0',
            'total_amount'         => 'nullable|numeric|min:0',
            'meal_plan'            => 'nullable|string|max:50',
            'payment_status'       => 'nullable|string|max:30',
            'payment_method'       => 'nullable|string|max:50',
            'booking_channel'      => 'nullable|string|max:50',
            'agent_name'           => 'nullable|string|max:150',
            'source'               => 'nullable|string|max:100',
            'arrival_time'         => 'nullable|date_format:H:i',
            'departure_time'       => 'nullable|date_format:H:i',
            'special_requests'     => 'nullable|string',
            'notes'                => 'nullable|string',
        ]);

        $v['num_nights'] = \Carbon\Carbon::parse($v['check_in'])->diffInDays(\Carbon\Carbon::parse($v['check_out']));

        if (empty($v['total_amount']) && !empty($v['rate_per_night'])) {
            $v['total_amount'] = $v['rate_per_night'] * $v['num_nights'] * ($v['num_rooms'] ?? 1);
        }

        $res = Reservation::create($v);
        $res->load(['guest', 'property:id,name,code']);

        $this->realtime->dispatch('reservation', 'New Reservation',
            "{$res->guest->full_name} — {$res->check_in} to {$res->check_out}",
            ['id' => $res->id, 'guest' => $res->guest->full_name, 'property' => $res->property?->name]
        );

        // Mail the guest the booking confirmation. If they don't yet have a
        // loyalty membership, auto-enrol as Bronze and send the membership-
        // welcome email too. Returning guests (welcomed_at stamped) only
        // get the booking confirmation. Mirrors the room-booking-widget
        // and service-booking flows so all three creation paths converge.
        $this->sendReservationEmails($res, $res->organization_id);

        return response()->json($res, 201);
    }

    /**
     * Sends the booking confirmation email and (on first contact) the
     * membership-welcome email. Failures are swallowed + logged — we never
     * want a SMTP hiccup to fail the reservation create itself.
     */
    private function sendReservationEmails(Reservation $res, ?int $orgId): void
    {
        $guest = $res->guest;
        $email = $guest?->email ? strtolower(trim($guest->email)) : null;
        if (!$email || !$orgId) return;

        $guestName = trim($guest->full_name ?: ($guest->first_name . ' ' . $guest->last_name)) ?: 'Guest';
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $hotelName = $org?->name ?? 'Hotel';

        $supportEmail = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'support_email')
            ->value('value') ?: 'support@hotel-tech.ai';
        $currency = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'currency')
            ->value('value') ?: 'EUR';
        $policiesJson = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'booking_policies')
            ->value('value') ?: '';
        $policies = $policiesJson ? (json_decode($policiesJson, true) ?: []) : [];

        // Idempotently ensure a Bronze member exists for this guest's email.
        // Guest::created already does this on first save, but re-running it
        // here is cheap and protects against guests created before the hook
        // landed (or where membership creation previously failed silently).
        try {
            app(GuestMemberLinkService::class)->ensureMemberForGuest($guest);
        } catch (\Throwable $e) {
            Log::warning('Reservation auto-enrol failed', [
                'guest_id' => $guest->id, 'error' => $e->getMessage(),
            ]);
        }

        $rate   = (float) ($res->rate_per_night ?? 0);
        $nights = (int) ($res->num_nights ?? 1);
        $total  = (float) ($res->total_amount ?? ($rate * $nights));

        // 1) Booking Confirmation
        try {
            Mail::to($email)->send(new BookingConfirmationMail(
                guestName: $guestName,
                hotelName: $hotelName,
                bookingReference: $res->confirmation_no ?: ('R-' . $res->id),
                unitName: $res->room_type ?: 'Room',
                checkIn: $res->check_in?->toDateString() ?? '',
                checkOut: $res->check_out?->toDateString() ?? '',
                nights: $nights,
                adults: (int) ($res->num_adults ?? 1),
                children: (int) ($res->num_children ?? 0),
                roomTotal: $total,
                extrasTotal: 0,
                grossTotal: $total,
                currency: $currency,
                pricePerNight: $rate,
                extras: [],
                policies: $policies,
                supportEmail: $supportEmail,
            ));
        } catch (\Throwable $e) {
            Log::warning('Reservation confirmation email failed', [
                'reservation_id' => $res->id, 'email' => $email, 'error' => $e->getMessage(),
            ]);
        }

        // 2) Membership Welcome — only on first contact
        try {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereHas('user', fn($q) => $q->where('email', $email))
                ->with(['user', 'tier'])
                ->first();

            if ($member && $member->welcomed_at === null) {
                $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

                EmailVerificationCode::create([
                    'email'      => $email,
                    'code'       => $code,
                    'expires_at' => now()->addHours(48),
                ]);

                Mail::to($email)->send(new BookingMembershipMail(
                    guestName: $guestName,
                    hotelName: $hotelName,
                    memberNumber: $member->member_number,
                    tierName: $member->tier?->name ?? 'Bronze',
                    email: $email,
                    code: $code,
                    supportEmail: $supportEmail,
                ));

                $member->forceFill(['welcomed_at' => now()])->save();
            }
        } catch (\Throwable $e) {
            Log::warning('Reservation membership email failed', [
                'reservation_id' => $res->id, 'email' => $email, 'error' => $e->getMessage(),
            ]);
        }
    }

    public function show(Reservation $reservation): JsonResponse
    {
        $reservation->load(['guest', 'property', 'inquiry', 'corporateAccount']);
        return response()->json($reservation);
    }

    public function update(Request $request, Reservation $reservation): JsonResponse
    {
        $v = $request->validate([
            'property_id'     => 'nullable|integer|exists:properties,id',
            'confirmation_no' => 'nullable|string|max:50|unique:reservations,confirmation_no,' . $reservation->id,
            'check_in'        => 'nullable|date',
            'check_out'       => 'nullable|date',
            'num_rooms'       => 'nullable|integer|min:1',
            'num_adults'      => 'nullable|integer|min:1',
            'num_children'    => 'nullable|integer|min:0',
            'room_type'       => 'nullable|string|max:100',
            'room_number'     => 'nullable|string|max:20',
            'rate_per_night'  => 'nullable|numeric|min:0',
            'total_amount'    => 'nullable|numeric|min:0',
            'meal_plan'       => 'nullable|string|max:50',
            'payment_status'  => 'nullable|string|max:30',
            'payment_method'  => 'nullable|string|max:50',
            'booking_channel' => 'nullable|string|max:50',
            'agent_name'      => 'nullable|string|max:150',
            'status'          => 'nullable|string|max:30',
            'arrival_time'    => 'nullable|date_format:H:i',
            'departure_time'  => 'nullable|date_format:H:i',
            'special_requests'=> 'nullable|string',
            'task_type'       => 'nullable|string|max:50',
            'task_due'        => 'nullable|date',
            'task_urgency'    => 'nullable|string|max:20',
            'task_notes'      => 'nullable|string',
            'task_completed'  => 'nullable|boolean',
            'notes'           => 'nullable|string',
        ]);

        $ci = $v['check_in'] ?? $reservation->check_in?->toDateString();
        $co = $v['check_out'] ?? $reservation->check_out?->toDateString();
        if ($ci && $co) {
            $v['num_nights'] = \Carbon\Carbon::parse($ci)->diffInDays(\Carbon\Carbon::parse($co));
        }

        if (($v['status'] ?? null) === 'Checked In' && !$reservation->checked_in_at) {
            $v['checked_in_at'] = now();
        }
        $isCheckingOut = ($v['status'] ?? null) === 'Checked Out' && !$reservation->checked_out_at;
        if ($isCheckingOut) {
            $v['checked_out_at'] = now();
        }
        if (($v['status'] ?? null) === 'Cancelled' && !$reservation->cancelled_at) {
            $v['cancelled_at'] = now();
        }

        DB::transaction(function () use ($reservation, $v, $isCheckingOut) {
            $reservation->update($v);
            if ($isCheckingOut && ($guest = $reservation->guest)) {
                $this->lifecycle->recordStay(
                    $guest,
                    $reservation->check_in,
                    $reservation->check_out,
                    $reservation->num_nights ?? null,
                    (float) ($reservation->total_amount ?? 0),
                );
            }
        });

        return response()->json($reservation->fresh()->load(['guest:id,full_name', 'property:id,name,code']));
    }

    public function destroy(Reservation $reservation): JsonResponse
    {
        $reservation->delete();
        return response()->json(['message' => 'Reservation deleted']);
    }

    public function checkIn(Reservation $reservation): JsonResponse
    {
        $reservation->update(['status' => 'Checked In', 'checked_in_at' => now()]);
        $reservation->load('guest:id,full_name');

        $this->realtime->dispatch('arrival', 'Guest Checked In',
            $reservation->guest?->full_name . ' has arrived',
            ['id' => $reservation->id, 'guest' => $reservation->guest?->full_name, 'room' => $reservation->room_number]
        );

        return response()->json($reservation);
    }

    public function checkOut(Reservation $reservation): JsonResponse
    {
        DB::transaction(function () use ($reservation) {
            $reservation->update(['status' => 'Checked Out', 'checked_out_at' => now()]);
            if ($guest = $reservation->guest) {
                $this->lifecycle->recordStay(
                    $guest,
                    $reservation->check_in,
                    $reservation->check_out,
                    $reservation->num_nights ?? null,
                    (float) ($reservation->total_amount ?? 0),
                );
            }
        });

        $guest = $reservation->guest;
        $this->realtime->dispatch('departure', 'Guest Checked Out',
            $guest?->full_name . ' has departed',
            ['id' => $reservation->id, 'guest' => $guest?->full_name, 'room' => $reservation->room_number]
        );

        return response()->json($reservation->fresh());
    }

    public function export(Request $request): StreamedResponse
    {
        $query = Reservation::with(['guest:id,full_name,company', 'property:id,name']);

        if ($s = $request->get('search')) {
            $query->where(function ($q) use ($s) {
                $q->where('confirmation_no', 'ilike', "%$s%")
                  ->orWhere('room_number', 'ilike', "%$s%")
                  ->orWhereHas('guest', fn($q2) => $q2->where('full_name', 'ilike', "%$s%")->orWhere('company', 'ilike', "%$s%"));
            });
        }
        if ($v = $request->get('status'))          $query->where('status', $v);
        if ($v = $request->get('property_id'))     $query->where('property_id', $v);
        if ($v = $request->get('room_type'))       $query->where('room_type', $v);
        if ($v = $request->get('meal_plan'))       $query->where('meal_plan', $v);
        if ($v = $request->get('payment_status'))  $query->where('payment_status', $v);
        if ($v = $request->get('booking_channel')) $query->where('booking_channel', $v);
        if ($v = $request->get('check_in_from'))   $query->where('check_in', '>=', $v);
        if ($v = $request->get('check_in_to'))     $query->where('check_in', '<=', $v);
        if ($v = $request->get('check_out_from'))  $query->where('check_out', '>=', $v);
        if ($v = $request->get('check_out_to'))    $query->where('check_out', '<=', $v);
        if ($request->get('arrivals_today'))   $query->where('check_in', now()->toDateString())->where('status', 'Confirmed');
        if ($request->get('departures_today')) $query->where('check_out', now()->toDateString())->where('status', 'Checked In');
        if ($request->get('in_house'))         $query->where('status', 'Checked In');

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['ID','Confirmation','Guest','Company','Property','Check-in','Check-out','Nights','Rooms','Room Type','Room No','Rate/Night','Total','Meal Plan','Payment Status','Channel','Status','Created']);
            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $r) {
                    fputcsv($out, [
                        $r->id, $r->confirmation_no, $r->guest?->full_name, $r->guest?->company,
                        $r->property?->name, $r->check_in?->toDateString(), $r->check_out?->toDateString(),
                        $r->num_nights, $r->num_rooms, $r->room_type, $r->room_number,
                        $r->rate_per_night, $r->total_amount, $r->meal_plan, $r->payment_status,
                        $r->booking_channel, $r->status, $r->created_at?->toDateString(),
                    ]);
                }
            });
            fclose($out);
        }, 'reservations-' . date('Y-m-d') . '.csv', ['Content-Type' => 'text/csv']);
    }
}
