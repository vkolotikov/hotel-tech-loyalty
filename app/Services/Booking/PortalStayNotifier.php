<?php

namespace App\Services\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Services\RealtimeEventService;
use Illuminate\Support\Facades\Log;

/**
 * What the portal adds after a stay is booked. The engine has already sent
 * the member's confirmation and the venue's notification mail
 * (BookingEngineService::sendBookingEmails()); this adds the realtime event
 * for the staff dashboard and the audit row that says where the booking
 * came from. The booking is committed by the time this runs, so neither
 * may turn into an error for the member.
 */
class PortalStayNotifier
{
    public function notify(BookingMirror $mirror, bool $online): void
    {
        $orgId = (int) $mirror->organization_id;

        try {
            app(RealtimeEventService::class)->dispatch(
                'booking.created',
                'New stay from the member portal',
                "{$mirror->guest_name} · {$mirror->apartment_name} · {$mirror->arrival_date?->toDateString()}",
                ['mirror_id' => $mirror->id, 'source' => 'member_portal', 'action_url' => "/bookings/{$mirror->id}"],
                $orgId,
            );
        } catch (\Throwable $e) {
            Log::warning('portal.stay_realtime_failed', ['mirror' => $mirror->id, 'error' => $e->getMessage()]);
        }

        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'subject_type'    => 'booking_mirror',
                'subject_id'      => $mirror->id,
                'action'          => 'booking.portal_confirmed',
                'description'     => 'Member portal stay ' . ($mirror->booking_reference ?: $mirror->reservation_id) . ($online ? ' (paid online)' : ' (pay at venue)'),
            ]);
        } catch (\Throwable $e) {
            Log::warning('portal.stay_audit_failed', ['mirror' => $mirror->id, 'error' => $e->getMessage()]);
        }
    }
}
