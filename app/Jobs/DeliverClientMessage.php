<?php

namespace App\Jobs;

use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use App\Models\ServiceBooking;
use App\Services\Appointments\VenueClock;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Sends one queued client message (Part D spec §5.3). It reads the
 * appointment again first: a message about a time that no longer holds (the
 * appointment was moved, or cancelled and this is not the cancellation) is
 * skipped as stale instead of sent.
 */
class DeliverClientMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** One attempt: a mail failure is marked on the row in handle(), never retried behind staff's back. */
    public int $tries = 1;

    public function __construct(public int $clientMessageId)
    {
    }

    public function handle(): void
    {
        $row = ClientMessage::withoutGlobalScopes()->find($this->clientMessageId);
        if (!$row || $row->status !== 'queued') {
            return;
        }

        // No request here: bind the tenant the rows belong to, and give back what was bound before — a worker runs
        // many jobs in one process, and the next must not inherit this organisation (its scope, its suppression list).
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        app()->instance('current_organization_id', (int) $row->organization_id);
        try {
            $this->deliver($row);
        } finally {
            if ($prior === null) {
                app()->forgetInstance('current_organization_id');
            } else {
                app()->instance('current_organization_id', $prior);
            }
        }
    }

    private function deliver(ClientMessage $row): void
    {
        $booking = ServiceBooking::withoutGlobalScopes()->with(['service', 'master'])->find($row->service_booking_id);
        if (!$booking || $this->stale($row, $booking)) {
            $row->forceFill(['status' => 'skipped', 'reason' => 'stale'])->save();

            return;
        }

        try {
            Mail::to($row->recipient)->send(new AppointmentMessageMail($row, $booking));
        } catch (\Throwable $e) {
            // Marked here and not rethrown: on the sync queue a rethrow would surface in the staff action that
            // queued this (after its transaction committed) as a 500. The row says it failed; staff see it.
            $row->forceFill(['status' => 'failed', 'reason' => 'mail_error'])->save();
            Log::warning('client message could not be sent', ['client_message_id' => $row->id, 'error' => $e->getMessage()]);

            return;
        }
        $row->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
    }

    public function failed(?\Throwable $e): void
    {
        ClientMessage::withoutGlobalScopes()->whereKey($this->clientMessageId)->update(['status' => 'failed', 'reason' => 'mail_error']);
        Log::warning('client message could not be sent', ['client_message_id' => $this->clientMessageId, 'error' => $e?->getMessage()]);
    }

    private function stale(ClientMessage $row, ServiceBooking $booking): bool
    {
        if ($row->kind !== 'cancelled' && (string) $booking->status === 'cancelled') {
            return true;
        }

        return VenueClock::wall($booking->start_at) !== VenueClock::wall($row->for_start_at);
    }
}
