<?php

namespace App\Services\Booking;

use App\Mail\AdminBookingNotificationMail;
use App\Mail\ServiceBookingConfirmationMail;
use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\AdminNotificationService;
use App\Services\Portal\PortalTheme;
use App\Services\RealtimeEventService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Everything that happens after a member-portal service booking is
 * confirmed and committed: the member's own confirmation mail (with the
 * discount line and payment wording), the venue's admin notification
 * (same shape ServicePublicController::sendServiceBookingEmails() sends
 * for the widget), a realtime event for the staff dashboard, and an
 * audit row.
 *
 * Deliberately its own class rather than inline in
 * PortalServiceBookingController::afterConfirm() — the controller is
 * already 500+ lines and none of this belongs to request handling. Each
 * side effect is wrapped in its own try/catch: the booking is already
 * committed by the time this runs, so a mail or realtime failure here
 * must never turn into a 500 for a member who already has a confirmed
 * appointment.
 */
class PortalBookingNotifier
{
    public function notify(ServiceBooking $booking, bool $online): void
    {
        $orgId = (int) $booking->organization_id;
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $hotelName = (string) ($org?->name ?: config('app.name'));
        $industry = $org ? PortalTheme::for($org)['industry'] : null;
        $policy = HotelSetting::getValue('services_cancellation_policy') ?: null;

        try {
            $this->sendConfirmation($booking, $hotelName, $industry, $policy);
        } catch (\Throwable $e) {
            Log::warning('portal.confirm_mail_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]);
        }

        try {
            $this->notifyVenue($booking, $orgId, $hotelName);
        } catch (\Throwable $e) {
            Log::warning('portal.confirm_admin_mail_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]);
        }

        try {
            app(RealtimeEventService::class)->dispatch(
                'service_booking.created',
                'New appointment from the member portal',
                "{$booking->customer_name} · {$booking->service?->name}",
                ['service_booking_id' => $booking->id, 'source' => 'member_portal'],
                $orgId,
            );
        } catch (\Throwable $e) {
            Log::warning('portal.confirm_realtime_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]);
        }

        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'subject_type'    => ServiceBooking::class,
                'subject_id'      => $booking->id,
                'action'          => 'service_booking.portal_confirmed',
                'description'     => "Member portal booking {$booking->booking_reference}" . ($online ? ' (paid online)' : ' (pay at venue)'),
            ]);
        } catch (\Throwable $e) {
            Log::warning('portal.confirm_audit_failed', ['booking' => $booking->id, 'error' => $e->getMessage()]);
        }
    }

    private function sendConfirmation(ServiceBooking $booking, string $hotelName, ?string $industry, ?string $policy): void
    {
        $discountAmount = (float) $booking->discount_amount;

        Mail::to($booking->customer_email)->queue(new ServiceBookingConfirmationMail(
            guestName: $booking->customer_name,
            hotelName: $hotelName,
            bookingReference: $booking->booking_reference,
            serviceName: $booking->service?->name ?? 'Appointment',
            masterName: $booking->master?->name,
            startAt: $booking->start_at->toIso8601String(),
            durationMinutes: (int) $booking->duration_minutes,
            partySize: (int) $booking->party_size,
            servicePrice: (float) $booking->service_price,
            extrasTotal: (float) $booking->extras_total,
            grossTotal: (float) $booking->total_amount,
            currency: $booking->currency,
            extras: $booking->extras->map(fn ($e) => [
                'name'       => $e->name,
                'quantity'   => $e->quantity,
                'line_total' => (float) $e->line_total,
            ])->all(),
            cancellationPolicy: $policy,
            industry: $industry,
            discountAmount: $discountAmount > 0 ? $discountAmount : null,
            discountLabel: $booking->discount_label,
            paymentStatus: $booking->payment_status,
        ));
    }

    /**
     * Same arguments ServicePublicController::sendServiceBookingEmails()
     * builds for kind:'service', read from the booking instead of the
     * widget's fresh request data. AdminBookingNotificationMail has no
     * discount field of its own, so the discount and the portal source
     * ride along in specialRequests, same as the widget's own
     * customer-notes-only version of that field.
     */
    private function notifyVenue(ServiceBooking $booking, int $orgId, string $hotelName): void
    {
        $extras = $booking->extras->map(fn ($x) => [
            'name'     => $x->name,
            'quantity' => (int) $x->quantity,
            'total'    => (float) $x->line_total,
        ])->all();

        app(AdminNotificationService::class)->send($orgId, new AdminBookingNotificationMail(
            kind:             'service',
            hotelName:        $hotelName,
            bookingReference: $booking->booking_reference,
            guestName:        $booking->customer_name,
            guestEmail:       $booking->customer_email,
            guestPhone:       $booking->customer_phone,
            unitName:         null,
            checkIn:          null,
            checkOut:         null,
            nights:           null,
            adults:           null,
            children:         null,
            serviceName:      $booking->service?->name ?? 'Service',
            masterName:       $booking->master?->name,
            startAt:          $booking->start_at?->toIso8601String(),
            durationMinutes:  (int) $booking->duration_minutes,
            partySize:        (int) $booking->party_size,
            baseTotal:        (float) $booking->service_price,
            extrasTotal:      (float) $booking->extras_total,
            grossTotal:       (float) $booking->total_amount,
            currency:         $booking->currency,
            extras:           $extras,
            specialRequests:  $this->specialRequests($booking),
            paymentStatus:    $booking->payment_status,
        ));
    }

    private function specialRequests(ServiceBooking $booking): string
    {
        $parts = ['Member portal'];
        $discountAmount = (float) $booking->discount_amount;
        if ($discountAmount > 0) {
            $parts[] = sprintf(
                'Discount: -%s %s (%s)',
                number_format($discountAmount, 2),
                $booking->currency,
                $booking->discount_label ?: 'member discount',
            );
        }
        if ($booking->customer_notes) {
            $parts[] = $booking->customer_notes;
        }

        return implode(' — ', $parts);
    }
}
