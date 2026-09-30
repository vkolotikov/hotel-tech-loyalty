<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\ServiceBooking;
use App\Services\Appointments\AppointmentActionRunner;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\AppointmentRefused;
use App\Services\Appointments\StaleAppointment;
use App\Services\Appointments\StaffBookingWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Thin: validation here, rules in App\Services\Appointments and the shared scheduler. */
class BookingController extends Controller
{
    public function store(Request $request, StaffBookingWriter $writer, AppointmentPresenter $presenter): JsonResponse
    {
        $key = trim((string) $request->header('Idempotency-Key'));
        if (strlen($key) < 8 || strlen($key) > 80) {
            throw new AppointmentRefused('idempotency_key_required', 'Send an Idempotency-Key header of 8 to 80 characters.', 422);
        }

        $data = $request->validate([
            'client_id'      => 'required|integer',
            'service_id'     => 'required|integer',
            'master_id'      => 'required|integer',
            'start'          => 'required|string|max:16',
            'source'         => 'nullable|string|in:admin,phone,walk_in',
            'customer_notes' => 'nullable|string|max:2000',
            'staff_notes'    => 'nullable|string|max:2000',
        ]);

        $result = $writer->create($data, $key, $request->user());

        return response()->json(
            ['booking' => $presenter->detail($result['booking']->fresh()), 'replayed' => $result['replayed']],
            $result['replayed'] ? 200 : 201,
        );
    }

    public function show(int $id, AppointmentPresenter $presenter): JsonResponse
    {
        $booking = ServiceBooking::find($id)
            ?? throw new AppointmentRefused('not_found', 'This appointment no longer exists.', 404);

        return response()->json(['booking' => $presenter->detail($booking)]);
    }

    public function update(Request $request, int $id, StaffBookingWriter $writer, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'start'     => 'required|string|max:16',
            'master_id' => 'required|integer',
            'revision'  => 'required|string|max:64',
        ]);

        try {
            $booking = $writer->move($id, $data['start'], (int) $data['master_id'], $data['revision'], $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($booking->fresh())]);
    }

    public function action(Request $request, int $id, AppointmentActionRunner $runner, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'action'   => 'required|string|max:40',
            'revision' => 'required|string|max:64',
            'reason'   => 'nullable|string|max:500',
        ]);

        try {
            $result = $runner->run($id, $data['action'], $data['revision'], $data['reason'] ?? null, $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($result['booking']), 'points' => $result['points']]);
    }

    /** Someone changed the appointment first: answer with what it is now. */
    private function stale(StaleAppointment $e, AppointmentPresenter $presenter): JsonResponse
    {
        return response()->json([
            'error'   => 'stale',
            'message' => $e->getMessage(),
            'current' => $presenter->detail($e->booking->fresh()),
        ], 409);
    }
}
