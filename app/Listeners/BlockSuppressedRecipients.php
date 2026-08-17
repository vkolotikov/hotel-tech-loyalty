<?php

namespace App\Listeners;

use App\Models\EmailSuppression;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\Log;

/**
 * The one place every outbound email must pass through.
 *
 * WHY A LISTENER AND NOT A QUERY SCOPE
 * The obvious home for this is EmailComplianceService::scopeEligible — except
 * that is called from exactly ONE of the ~26 send sites in this codebase
 * (SendEmailCampaignChunk). Twenty-five others, including every guest-facing
 * booking mail and a second bulk-marketing loop, would silently bypass it.
 *
 * Laravel fires MessageSending immediately before handing a message to the
 * transport, and returning false from a listener cancels the send
 * (Illuminate\Mail\Mailer::shouldSendMessage). That makes this the only choke
 * point that CANNOT be bypassed by a new call site someone adds later — which
 * matters more than elegance, because the failure mode is invisible: mail to a
 * dead address just quietly damages the sending reputation every tenant shares.
 *
 * Query-level filtering is still worth doing where it is cheap (it keeps
 * recipient COUNTS honest for the operator); this is the backstop that makes
 * correctness independent of remembering to.
 */
class BlockSuppressedRecipients
{
    public function handle(MessageSending $event): bool
    {
        $message = $event->message;

        $recipients = array_merge(
            $message->getTo() ?: [],
            $message->getCc() ?: [],
            $message->getBcc() ?: [],
        );

        if ($recipients === []) {
            return true;
        }

        // Scope to the org sending this message, when there is one. A queued
        // job binds it; a console command may not. Null means only
        // platform-wide suppressions apply, which is the safe direction — we
        // under-suppress rather than silently dropping another tenant's mail.
        $orgId = app()->bound('current_organization_id')
            ? (int) app('current_organization_id')
            : null;

        foreach ($recipients as $address) {
            $email = $address->getAddress();

            if (EmailSuppression::isSuppressed($email, $orgId ?: null)) {
                // Logged, never silent. A cancelled send that leaves no trace
                // is indistinguishable from a delivery failure when someone
                // asks "why didn't my customer get this?".
                Log::info('Outbound email blocked: recipient is suppressed', [
                    'email'           => $email,
                    'organization_id' => $orgId,
                    'subject'         => $message->getSubject(),
                ]);

                // Cancels the send for the whole message. Deliberate: a
                // message addressed partly to a suppressed recipient cannot be
                // partially sent, and quietly delivering to the others while
                // reporting success would be worse than not sending.
                return false;
            }
        }

        return true;
    }
}
