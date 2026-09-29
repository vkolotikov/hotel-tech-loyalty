<?php

namespace App\Services\Booking;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Services\AdminNotificationService;
use App\Services\Portal\PortalTheme;
use App\Services\RealtimeEventService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Everything that happens after a member's cancellation is done: the
 * member's mail, the venue's mail, a realtime event for the staff
 * dashboard and an audit row. The cancellation is committed by the time
 * this runs, so no failure here may reach the member.
 */
class PortalCancellationNotifier
{
    public function notify(CancellationOutcome $o): void
    {
        $b = $o->booking;
        $orgId = (int) $b->organization_id;
        $org = Organization::withoutGlobalScopes()->find($orgId);
        $hotel = (string) (HotelSetting::getValue('company_name') ?: $org?->name ?: config('app.name'));
        $facts = $this->facts($o);

        if (!$o->memberMailed && $facts['email']) {
            try {
                Mail::to($facts['email'])->queue(new BookingCancelledMail(
                    guestName: $facts['name'], hotelName: $hotel, bookingReference: $facts['reference'], title: $facts['title'], when: $facts['when'],
                    money: $o->money, amount: $o->amount, currency: $o->currency,
                    supportEmail: (string) ($org?->email ?: HotelSetting::getValue('mail_reply_to', 'support@hotel-tech.ai')),
                    industry: $org ? PortalTheme::for($org)['industry'] : null,
                ));
            } catch (\Throwable $e) {
                Log::warning('portal.cancel_mail_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
            }
        }

        try {
            app(AdminNotificationService::class)->send($orgId, new AdminBookingCancelledMail(
                kind: $o->kind, hotelName: $hotel, bookingReference: $facts['reference'], guestName: $facts['name'], guestEmail: $facts['email'],
                title: $facts['title'], when: $facts['when'], money: $o->money, amount: $o->amount, currency: $o->currency, couponReleased: $o->couponReleased,
                adminUrl: rtrim(config('app.frontend_url') ?? config('app.url') ?? '', '/'),
                pmsFailed: $o->pmsCancelled === false,
            ));
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_admin_mail_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
        }

        try {
            app(RealtimeEventService::class)->dispatch(
                'booking.cancelled',
                'Cancelled in the member portal',
                "{$facts['name']} · {$facts['title']} · {$facts['when']}",
                [$o->kind === 'stay' ? 'mirror_id' : 'service_booking_id' => $b->id, 'source' => MemberCancellation::REASON, 'refund' => $o->money],
                $orgId,
            );
        } catch (\Throwable $e) {
            Log::warning('portal.cancel_realtime_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
        }

        // A stay's own MemberCancellation::cancelStay() already commits one
        // 'booking.member_cancelled' AuditLog row for every outcome
        // (writeStayCancellation()/finishRefundedStay(), inside
        // auditMemberCancelled()) — writing a second one here would double
        // it. cancelService() writes no audit row of its own, so this is
        // the only one a cancelled appointment gets.
        if ($o->kind !== 'stay') {
            try {
                AuditLog::create([
                    'organization_id' => $orgId,
                    'subject_type'    => ServiceBooking::class,
                    'subject_id'      => $b->id,
                    'action'          => 'service_booking.member_cancelled',
                    'new_values'      => $o->toArray(),
                    'description'     => "The member cancelled {$facts['reference']} in the portal (payment: {$o->money})",
                ]);
            } catch (\Throwable $e) {
                Log::warning('portal.cancel_audit_failed', ['kind' => $o->kind, 'booking' => $b->id, 'error' => $e->getMessage()]);
            }
        }
    }

    /**
     * The booking's own contact email, or — when that is blank — the
     * member's own account email: a member who cancelled is always told.
     */
    private function contactEmail(ServiceBooking|BookingMirror $b, ?string $own): ?string
    {
        $own = trim((string) $own);
        if ($own !== '') {
            return $own;
        }
        if (!$b->member_id) {
            return null;
        }
        $email = trim((string) LoyaltyMember::withoutGlobalScopes()->whereKey($b->member_id)->first()?->user?->email);

        return $email !== '' ? $email : null;
    }

    /** @return array{name: string, email: ?string, reference: string, title: string, when: string} */
    private function facts(CancellationOutcome $o): array
    {
        $b = $o->booking;
        if ($b instanceof BookingMirror) {
            return [
                'name'      => $b->guest_name ?: 'Guest',
                'email'     => $this->contactEmail($b, $b->guest_email),
                'reference' => (string) ($b->booking_reference ?: $b->reservation_id),
                'title'     => $b->apartment_name ?: 'Stay',
                'when'      => trim(($b->arrival_date?->format('M j, Y') ?? '') . ' – ' . ($b->departure_date?->format('M j, Y') ?? ''), ' –'),
            ];
        }

        $b->loadMissing(['service', 'master']);

        return [
            'name'      => $b->customer_name ?: 'Guest',
            'email'     => $this->contactEmail($b, $b->customer_email),
            'reference' => (string) $b->booking_reference,
            'title'     => ($b->service?->name ?? 'Appointment') . ($b->master?->name ? " · {$b->master->name}" : ''),
            // The stored digits ARE the venue's wall clock (see
            // AppointmentClock): printed as they are, like the confirmation
            // mail, never converted.
            'when'      => $b->start_at ? $b->start_at->format('M j, Y · H:i') : '',
        ];
    }
}
