<?php

namespace App\Console\Commands;

use App\Models\ClientMessage;
use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\Appointments\Messages\ClientMessenger;
use App\Services\Appointments\Messages\MessageSettings;
use App\Services\Appointments\VenueClock;
use App\Services\Portal\AppointmentClock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * The reminder before each visit (Part D spec §5.4). Every five minutes,
 * for each venue with a reminder of H hours: every pending or confirmed
 * appointment whose reminder moment (start − H, on the venue's clock) fell
 * in the last 30 minutes, unless it was booked or moved after that moment
 * (the booking or move email already told the client) or already has a
 * reminder for its current time. A missed run is caught up within 30
 * minutes; a longer outage skips rather than sends late.
 */
class SendAppointmentReminders extends Command
{
    protected $signature = 'appointments:send-reminders';

    protected $description = 'Email the reminder for every appointment whose reminder moment has come (Part D).';

    public function handle(ClientMessenger $messenger): int
    {
        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', MessageSettings::REMINDER_HOURS)
            ->whereIn('value', ['2', '24', '48'])
            ->pluck('organization_id')->unique()->values();

        $queued = 0;
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        foreach ($orgIds as $orgId) {
            try {
                $queued += $this->forOrganization((int) $orgId, $messenger);
            } catch (\Throwable $e) {
                Log::warning('appointments:send-reminders failed for an organization', ['organization_id' => $orgId, 'error' => $e->getMessage()]);
            } finally {
                // Each organisation binds its own tenant; give back whatever was bound before.
                if ($prior === null) {
                    app()->forgetInstance('current_organization_id');
                } else {
                    app()->instance('current_organization_id', $prior);
                }
                app()->forgetScopedInstances();
            }
        }

        $this->line("reminders queued: {$queued}");

        return self::SUCCESS;
    }

    private function forOrganization(int $orgId, ClientMessenger $messenger): int
    {
        $hours = MessageSettings::read($orgId)['reminder_hours'];
        if ($hours === 0) {
            return 0;
        }

        app()->instance('current_organization_id', $orgId);
        app()->forgetScopedInstances(); // the venue's zone is memoised per request
        $zone = VenueClock::zone($orgId);
        $now = VenueClock::now($orgId);

        $bookings = ServiceBooking::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('status', ['pending', 'confirmed'])
            ->where('start_at', '>', $now->addHours($hours)->subMinutes(30)->format('Y-m-d H:i:s'))
            ->where('start_at', '<=', $now->addHours($hours)->format('Y-m-d H:i:s'))
            ->get();

        $queued = 0;
        foreach ($bookings as $booking) {
            $moment = AppointmentClock::toInstant($booking->start_at, $zone)->subHours($hours);
            if ($booking->created_at && $booking->created_at->greaterThan($moment)) {
                continue; // booked inside the window
            }
            $movedLate = ClientMessage::withoutGlobalScopes()
                ->where('service_booking_id', $booking->id)->where('kind', 'moved')
                ->where('created_at', '>', $moment->utc()->format('Y-m-d H:i:s'))
                ->exists();
            if ($movedLate) {
                continue; // the move email already told the client
            }
            $row = $messenger->remind($booking);
            if ($row !== null && $row->status === 'queued') {
                $queued++;
            }
        }

        return $queued;
    }
}
