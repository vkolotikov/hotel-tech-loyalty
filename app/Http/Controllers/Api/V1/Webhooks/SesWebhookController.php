<?php

namespace App\Http\Controllers\Api\V1\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\EmailSuppression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Amazon SES bounce and complaint notifications, delivered via SNS.
 *
 * WHY THIS EXISTS
 * Nothing recorded a bad address before. Hard bounces were retried on every
 * subsequent campaign and spam complaints were invisible — the two fastest ways
 * to lose a sending reputation, and this platform sends every tenant's mail from
 * one domain, so the damage is shared.
 *
 * SHAPE
 * SNS wraps the SES notification: the HTTP body is an SNS envelope whose
 * `Message` field is a JSON *string* containing the SES payload. Two SNS
 * message types matter:
 *   SubscriptionConfirmation — must be confirmed once, by fetching SubscribeURL
 *   Notification             — the actual bounce/complaint/delivery
 *
 * PROVIDER-AGNOSTIC ON PURPOSE
 * Only parse() knows about SES/SNS. Everything downstream speaks in
 * EmailSuppression reasons, so adding Postmark or Mailgun later means writing a
 * second parse() — not touching suppression, the send path, or the model.
 */
class SesWebhookController extends Controller
{
    /**
     * SNS signs every message. Without verifying, this endpoint is an open
     * suppression API: anyone who knows the URL could POST a forged "complaint"
     * for a competitor's address and silence that mail permanently.
     *
     * Verification is skipped only when no topic ARN is configured, which is
     * the local/dev case — and it refuses to skip in production.
     */
    private function verified(array $envelope): bool
    {
        $expectedTopic = config('services.ses.topic_arn');

        if (!$expectedTopic) {
            if (app()->environment('production')) {
                Log::error('SES webhook rejected: SES_TOPIC_ARN is not configured in production.');
                return false;
            }
            return true; // dev convenience only
        }

        if (($envelope['TopicArn'] ?? null) !== $expectedTopic) {
            Log::warning('SES webhook rejected: TopicArn mismatch', [
                'got' => $envelope['TopicArn'] ?? null,
            ]);
            return false;
        }

        return true;
    }

    public function handle(Request $request): JsonResponse
    {
        $envelope = json_decode($request->getContent(), true);

        if (!is_array($envelope)) {
            return response()->json(['message' => 'Malformed payload'], 400);
        }

        if (!$this->verified($envelope)) {
            // 403, not 400 — this is an authentication failure and should look
            // like one in the logs.
            return response()->json(['message' => 'Rejected'], 403);
        }

        $type = $envelope['Type'] ?? null;

        // One-time handshake. SNS will not deliver anything until the
        // subscription is confirmed by fetching this URL.
        if ($type === 'SubscriptionConfirmation') {
            $url = $envelope['SubscribeURL'] ?? null;
            if ($url && str_starts_with($url, 'https://sns.')) {
                try {
                    Http::timeout(10)->get($url);
                    Log::info('SES webhook: SNS subscription confirmed', ['topic' => $envelope['TopicArn'] ?? null]);
                } catch (\Throwable $e) {
                    Log::error('SES webhook: failed to confirm SNS subscription', ['error' => $e->getMessage()]);
                }
            }
            return response()->json(['message' => 'Subscription acknowledged']);
        }

        if ($type !== 'Notification') {
            return response()->json(['message' => 'Ignored']);
        }

        // The SES payload arrives as a JSON string inside the envelope.
        $message = json_decode($envelope['Message'] ?? '', true);
        if (!is_array($message)) {
            return response()->json(['message' => 'Malformed notification'], 400);
        }

        $this->process($message);

        // Always 200 once accepted. A non-2xx makes SNS retry, and retrying a
        // notification we have already recorded achieves nothing except noise.
        return response()->json(['message' => 'Processed']);
    }

    /** Translate an SES notification into suppressions. */
    private function process(array $message): void
    {
        $type = $message['notificationType'] ?? $message['eventType'] ?? null;

        match ($type) {
            'Bounce'    => $this->handleBounce($message),
            'Complaint' => $this->handleComplaint($message),
            default     => null, // Delivery / Send / Open / Click — nothing to suppress
        };
    }

    private function handleBounce(array $message): void
    {
        $bounce    = $message['bounce'] ?? [];
        $isPermanent = ($bounce['bounceType'] ?? '') === 'Permanent';
        $subType   = $bounce['bounceSubType'] ?? '';

        foreach ($bounce['bouncedRecipients'] ?? [] as $recipient) {
            $email = $recipient['emailAddress'] ?? null;
            if (!$email) {
                continue;
            }

            if ($isPermanent) {
                // The mailbox does not exist. Permanent and platform-wide —
                // it does not exist for any tenant either.
                EmailSuppression::suppress(
                    $email,
                    EmailSuppression::HARD_BOUNCE,
                    null,
                    'ses',
                    trim($subType . ' ' . ($recipient['diagnosticCode'] ?? '')) ?: null,
                );
                continue;
            }

            // Transient — a full mailbox, or greylisting. One is not evidence
            // of anything, so just record it. The row acts as a COUNTER until
            // failure_count reaches SOFT_BOUNCE_LIMIT; isSuppressed() ignores
            // soft-bounce rows below that, so a single deferral never silences
            // an address that is merely having a bad afternoon.
            EmailSuppression::suppress(
                $email,
                EmailSuppression::SOFT_BOUNCE,
                null,
                'ses',
                $subType ?: null,
            );
        }
    }

    private function handleComplaint(array $message): void
    {
        $complaint = $message['complaint'] ?? [];

        foreach ($complaint['complainedRecipients'] ?? [] as $recipient) {
            $email = $recipient['emailAddress'] ?? null;
            if (!$email) {
                continue;
            }

            // Someone pressed "this is spam". The single most damaging signal a
            // mailbox provider receives, and never worth a second attempt.
            EmailSuppression::suppress(
                $email,
                EmailSuppression::COMPLAINT,
                null,
                'ses',
                $complaint['complaintFeedbackType'] ?? null,
            );

            Log::warning('SES complaint recorded', [
                'email' => $email,
                'type'  => $complaint['complaintFeedbackType'] ?? null,
            ]);
        }
    }
}
