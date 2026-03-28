<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Venue;
use App\Models\VenueBooking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VenueController extends Controller
{
    // ── Venues ──

    public function indexVenues(Request $request): JsonResponse
    {
        $query = Venue::with('property');

        if ($request->filled('property_id')) {
            $query->where('property_id', $request->property_id);
        }
        if ($request->filled('venue_type')) {
            $query->where('venue_type', $request->venue_type);
        }
        if ($request->has('is_active')) {
            $query->where('is_active', filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json($query->orderBy('name')->get());
    }

    public function storeVenue(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'venue_type'   => 'required|string|max:255',
            'property_id'  => 'required|exists:properties,id',
            'capacity'     => 'nullable|integer',
            'hourly_rate'  => 'nullable|numeric',
            'half_day_rate'=> 'nullable|numeric',
            'full_day_rate'=> 'nullable|numeric',
            'amenities'    => 'nullable|array',
            'floor'        => 'nullable|string|max:50',
            'area_sqm'     => 'nullable|integer',
            'is_active'    => 'nullable|boolean',
            'description'  => 'nullable|string',
        ]);

        $venue = Venue::create($validated);
        $venue->load('property');

        return response()->json($venue, 201);
    }

    public function updateVenue(Request $request, Venue $venue): JsonResponse
    {
        $validated = $request->validate([
            'name'         => 'sometimes|required|string|max:255',
            'venue_type'   => 'sometimes|required|string|max:255',
            'property_id'  => 'sometimes|required|exists:properties,id',
            'capacity'     => 'nullable|integer',
            'hourly_rate'  => 'nullable|numeric',
            'half_day_rate'=> 'nullable|numeric',
            'full_day_rate'=> 'nullable|numeric',
            'amenities'    => 'nullable|array',
            'floor'        => 'nullable|string|max:50',
            'area_sqm'     => 'nullable|integer',
            'is_active'    => 'nullable|boolean',
            'description'  => 'nullable|string',
        ]);

        $venue->update($validated);
        $venue->load('property');

        return response()->json($venue);
    }

    public function destroyVenue(Venue $venue): JsonResponse
    {
        $venue->delete();
        return response()->json(['message' => 'Venue deleted']);
    }

    // ── Bookings ──

    public function indexBookings(Request $request): JsonResponse
    {
        $query = VenueBooking::with([
            'venue.property',
            'guest:id,full_name,company',
            'corporateAccount:id,company_name',
        ]);

        if ($request->filled('venue_id'))              $query->where('venue_id', $request->venue_id);
        if ($request->filled('venue_type'))             $query->whereHas('venue', fn($q) => $q->where('venue_type', $request->venue_type));
        if ($request->filled('date'))                   $query->where('booking_date', $request->date);
        if ($request->filled('date_from'))              $query->where('booking_date', '>=', $request->date_from);
        if ($request->filled('date_to'))                $query->where('booking_date', '<=', $request->date_to);
        if ($request->filled('status'))                 $query->where('status', $request->status);
        if ($request->filled('guest_id'))               $query->where('guest_id', $request->guest_id);
        if ($request->filled('corporate_account_id'))   $query->where('corporate_account_id', $request->corporate_account_id);

        $bookings = $query->orderByDesc('booking_date')
            ->orderBy('start_time')
            ->paginate(25);

        return response()->json($bookings);
    }

    public function storeBooking(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'venue_id'              => 'required|exists:venues,id',
            'booking_date'          => 'required|date',
            'start_time'            => 'required|date_format:H:i',
            'end_time'              => 'required|date_format:H:i|after:start_time',
            'guest_id'              => 'nullable|exists:guests,id',
            'corporate_account_id'  => 'nullable|exists:corporate_accounts,id',
            'event_name'            => 'nullable|string|max:255',
            'event_type'            => 'nullable|string|max:255',
            'attendees'             => 'nullable|integer',
            'setup_style'           => 'nullable|string|max:255',
            'catering_required'     => 'nullable|boolean',
            'av_required'           => 'nullable|boolean',
            'special_requirements'  => 'nullable|string',
            'contact_name'          => 'nullable|string|max:255',
            'contact_phone'         => 'nullable|string|max:50',
            'contact_email'         => 'nullable|email|max:255',
            'rate_charged'          => 'nullable|numeric',
            'status'                => 'nullable|string|max:50',
            'notes'                 => 'nullable|string',
        ]);

        $booking = VenueBooking::create($validated);
        $booking->load('venue.property', 'guest:id,full_name,company', 'corporateAccount:id,company_name');

        return response()->json($booking, 201);
    }

    public function updateBooking(Request $request, VenueBooking $venueBooking): JsonResponse
    {
        $validated = $request->validate([
            'venue_id'              => 'sometimes|required|exists:venues,id',
            'booking_date'          => 'sometimes|required|date',
            'start_time'            => 'sometimes|required|date_format:H:i',
            'end_time'              => 'sometimes|required|date_format:H:i',
            'guest_id'              => 'nullable|exists:guests,id',
            'corporate_account_id'  => 'nullable|exists:corporate_accounts,id',
            'event_name'            => 'nullable|string|max:255',
            'event_type'            => 'nullable|string|max:255',
            'attendees'             => 'nullable|integer',
            'setup_style'           => 'nullable|string|max:255',
            'catering_required'     => 'nullable|boolean',
            'av_required'           => 'nullable|boolean',
            'special_requirements'  => 'nullable|string',
            'contact_name'          => 'nullable|string|max:255',
            'contact_phone'         => 'nullable|string|max:50',
            'contact_email'         => 'nullable|email|max:255',
            'rate_charged'          => 'nullable|numeric',
            'status'                => 'nullable|string|max:50',
            'notes'                 => 'nullable|string',
        ]);

        $venueBooking->update($validated);
        $venueBooking->load('venue.property', 'guest:id,full_name,company', 'corporateAccount:id,company_name');

        return response()->json($venueBooking);
    }

    public function destroyBooking(VenueBooking $venueBooking): JsonResponse
    {
        $venueBooking->delete();
        return response()->json(['message' => 'Booking deleted']);
    }

    public function calendarBookings(Request $request): JsonResponse
    {
        $request->validate([
            'date_from' => 'required|date',
            'date_to'   => 'required|date|after_or_equal:date_from',
        ]);

        $bookings = VenueBooking::with('venue:id,name,venue_type')
            ->whereBetween('booking_date', [$request->date_from, $request->date_to])
            ->orderBy('booking_date')
            ->orderBy('start_time')
            ->get()
            ->map(fn($b) => [
                'id'           => $b->id,
                'venue_name'   => $b->venue->name,
                'venue_type'   => $b->venue->venue_type,
                'booking_date' => $b->booking_date->toDateString(),
                'start_time'   => $b->start_time,
                'end_time'     => $b->end_time,
                'event_name'   => $b->event_name,
                'status'       => $b->status,
                'attendees'    => $b->attendees,
            ])
            ->groupBy('booking_date');

        return response()->json($bookings);
    }
}
