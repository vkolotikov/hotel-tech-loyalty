<?php

namespace App\Services\Appointments\Messages;

use App\Jobs\DeliverClientMessage;
use App\Models\ClientMessage;
use App\Models\EmailSuppression;
use App\Models\ServiceBooking;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The one sender of client messages about appointments (Part D spec §5.2).
 * Every staff action that may tell the client calls afterStaffAction() once
 * its own change is saved; the reminder command calls remind(). Each call
 * decides, writes one client_messages row (queued, or skipped with the
 * reason) and queues the delivery after the surrounding transaction commits.
 * A staff action is never refused or undone because of a message.
 */
final class ClientMessenger
{
    public function afterStaffAction(ServiceBooking $booking, string $kind, ?bool $notify, User $actor, ?\DateTimeInterface $previousStart = null): ClientMessage
    {
        try {
            $tell = $notify ?? MessageSettings::read((int) $booking->organization_id)['staff_default'];

            return $this->record($booking, $kind, $tell ? null : 'not_requested', (int) $actor->id, $previousStart);
        } catch (\Throwable $e) {
            Log::warning('client message could not be recorded', ['booking_id' => $booking->id, 'kind' => $kind, 'error' => $e->getMessage()]);

            return new ClientMessage(['kind' => $kind, 'status' => 'failed', 'reason' => 'mail_error', 'channel' => 'email']);
        }
    }

    /** Null when this appointment already has a reminder for its current time, or when it could not be recorded. */
    public function remind(ServiceBooking $booking): ?ClientMessage
    {
        try {
            return $this->record($booking, 'reminder', null, null, null);
        } catch (UniqueConstraintViolationException) {
            return null;
        } catch (\Throwable $e) {
            // One appointment's failure never stops the reminders of the others.
            Log::warning('client reminder could not be recorded', ['booking_id' => $booking->id, 'error' => $e->getMessage()]);

            return null;
        }
    }

    private function record(ServiceBooking $booking, string $kind, ?string $declined, ?int $actorId, ?\DateTimeInterface $previousStart): ClientMessage
    {
        // Its own transaction, which is a savepoint inside a staff action's: on PostgreSQL a failed statement
        // aborts the transaction it runs in, and a message must never take the staff action down with it.
        $row = DB::transaction(function () use ($booking, $kind, $declined, $actorId, $previousStart) {
            $orgId = (int) $booking->organization_id;
            $recipient = MessageRecipient::for($booking);
            $reason = $declined
                ?? ($recipient === null ? 'no_recipient' : null)
                ?? (EmailSuppression::isSuppressed($recipient, $orgId) ? 'suppressed' : null);

            return ClientMessage::create([
                'service_booking_id' => $booking->id,
                'kind'               => $kind,
                'channel'            => 'email',
                'recipient'          => $recipient,
                'locale'             => MessageLocale::for($booking, MessageSettings::read($orgId)['language']),
                'status'             => $reason === null ? 'queued' : 'skipped',
                'reason'             => $reason,
                'for_start_at'       => $booking->start_at,
                'previous_start_at'  => $previousStart,
                'actor_user_id'      => $actorId,
            ]);
        });

        if ($row->status === 'queued') {
            try {
                DeliverClientMessage::dispatch($row->id)->afterCommit();
            } catch (\Throwable $e) {
                // The sync queue runs the job at once; its failure is already on the row.
                Log::warning('client message delivery failed', ['client_message_id' => $row->id, 'error' => $e->getMessage()]);
            }
        }

        return $row;
    }
}
