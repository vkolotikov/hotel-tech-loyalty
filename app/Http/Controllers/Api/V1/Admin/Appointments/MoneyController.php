<?php

namespace App\Http\Controllers\Api\V1\Admin\Appointments;

use App\Http\Controllers\Controller;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\Money\TakingsReport;
use App\Services\Appointments\Setup\SetupAccess;
use App\Services\Appointments\StaleAppointment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Money at the desk (Part E): payments by any staff member; refunds and takings by managers. */
class MoneyController extends Controller
{
    public function payments(Request $request, int $id, AppointmentMoney $money, AppointmentPresenter $presenter): JsonResponse
    {
        $data = $request->validate([
            'amount'   => 'required|numeric|min:0.01|max:100000',
            'method'   => ['required', 'string', Rule::in(ServiceBookingPayment::DESK_METHODS)],
            'note'     => 'nullable|string|max:200',
            'revision' => 'required|string|max:64',
        ]);

        try {
            $booking = $money->takePayment($id, (float) $data['amount'], $data['method'], $data['note'] ?? null, $data['revision'], $request->user());
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($booking)]);
    }

    public function refunds(Request $request, int $id, AppointmentMoney $money, AppointmentPresenter $presenter): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate([
            'amount'   => 'required|numeric|min:0.01|max:100000',
            'via'      => ['required', 'string', Rule::in([...ServiceBookingPayment::DESK_METHODS, 'online_card'])],
            'reason'   => 'required|string|max:200',
            'revision' => 'required|string|max:64',
            // A desk entry made by mistake: undone, and what it covered is owed again.
            'corrects' => 'nullable|boolean',
        ]);

        try {
            $booking = $money->refund($id, (float) $data['amount'], $data['via'], $data['reason'], $data['revision'], $request->user(), $request->boolean('corrects'));
        } catch (StaleAppointment $e) {
            return $this->stale($e, $presenter);
        }

        return response()->json(['booking' => $presenter->detail($booking)]);
    }

    public function takings(Request $request): JsonResponse
    {
        SetupAccess::requireManager($request->user());
        $data = $request->validate(['date' => 'required|date_format:Y-m-d']);

        return response()->json(TakingsReport::for((int) app('current_organization_id'), $data['date']));
    }

    /** Someone changed the appointment first: answer with what it is now (as BookingController does). */
    private function stale(StaleAppointment $e, AppointmentPresenter $presenter): JsonResponse
    {
        return response()->json([
            'error'   => 'stale',
            'message' => $e->getMessage(),
            'current' => $presenter->detail($e->booking->fresh()),
        ], 409);
    }
}
