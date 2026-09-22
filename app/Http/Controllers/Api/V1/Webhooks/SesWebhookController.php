<?php

namespace App\Http\Controllers\Api\V1\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\EmailSuppression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
 * WHO MAY SPEAK HERE
 * This endpoint is a write API for the suppression list: a forged "complaint"
 * silences an address, platform-wide and permanently. So a message is acted on
 * only when (1) its TopicArn is the one configured for this deployment AND
 * (2) its SNS SIGNATURE verifies against a certificate fetched from an
 * `https://sns.<region>.amazonaws.com/…pem` URL — the same check the AWS SDKs'
 * message validator makes, done here with OpenSSL so no new dependency rides
 * along. The ARN alone is not a secret (its shape is public and it appears in
 * runbooks); the signature is what proves AWS sent the message.
 *
 * PROVIDER-AGNOSTIC ON PURPOSE
 * Only process() knows about SES. Everything downstream speaks in
 * EmailSuppression reasons, so adding Postmark or Mailgun later means writing a
 * second webhook — not touching suppression, the send path, or the model.
 */
class SesWebhookController extends Controller
{
    /** The only hosts SNS signs from and confirms on. */
    private const SNS_HOST = '/^sns\.[a-z0-9-]+\.amazonaws\.com$/';

    /** How long a fetched signing certificate is kept; AWS rotates them rarely. */
    private const CERT_TTL_SECONDS = 6 * 3600;

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
        // subscription is confirmed by fetching this URL — and only an SNS
        // URL is ever fetched, so this cannot be turned into a request to
        // somewhere else with our identity.
        if ($type === 'SubscriptionConfirmation') {
            $url = (string) ($envelope['SubscribeURL'] ?? '');

            if ($this->isSnsUrl($url)) {
                try {
                    Http::timeout(10)->get($url);
                    Log::info('SES webhook: SNS subscription confirmed', ['topic' => $envelope['TopicArn'] ?? null]);
                } catch (\Throwable $e) {
                    Log::error('SES webhook: failed to confirm SNS subscription', ['error' => $e->getMessage()]);
                }
            } else {
                Log::warning('SES webhook: SubscribeURL is not an SNS URL; not fetched', ['url' => $url]);
            }

            return response()->json(['message' => 'Subscription acknowledged']);
        }

        if ($type !== 'Notification') {
            return response()->json(['message' => 'Ignored']);
        }

        // The SES payload arrives as a JSON string inside the envelope.
        $message = json_decode((string) ($envelope['Message'] ?? ''), true);
        if (!is_array($message)) {
            return response()->json(['message' => 'Malformed notification'], 400);
        }

        $this->process($message);

        // Always 200 once accepted. A non-2xx makes SNS retry, and retrying a
        // notification we have already recorded achieves nothing except noise.
        return response()->json(['message' => 'Processed']);
    }

    /**
     * The topic must be ours and the signature must be AWS's.
     *
     * With no topic ARN configured nothing can be verified against: refused
     * outright in production, accepted only as a local development convenience.
     */
    private function verified(array $envelope): bool
    {
        $expectedTopic = config('services.ses.topic_arn');

        if (!$expectedTopic) {
            if (app()->environment('production')) {
                Log::error('SES webhook rejected: SES_TOPIC_ARN is not configured in production.');
                return false;
            }

            return true;
        }

        if (($envelope['TopicArn'] ?? null) !== $expectedTopic) {
            Log::warning('SES webhook rejected: TopicArn mismatch', [
                'got' => $envelope['TopicArn'] ?? null,
            ]);
            return false;
        }

        if (!$this->signatureValid($envelope)) {
            Log::warning('SES webhook rejected: SNS signature did not verify', [
                'message_id' => $envelope['MessageId'] ?? null,
                'type'       => $envelope['Type'] ?? null,
            ]);
            return false;
        }

        return true;
    }

    /**
     * SNS message signature verification (SignatureVersion 1 = SHA1 with RSA,
     * 2 = SHA256 with RSA) over the canonical string the SNS documentation
     * defines, with the public key taken from the certificate at
     * SigningCertURL — which must itself be an SNS URL.
     */
    private function signatureValid(array $envelope): bool
    {
        $algorithm = match ((string) ($envelope['SignatureVersion'] ?? '')) {
            '1'     => OPENSSL_ALGO_SHA1,
            '2'     => OPENSSL_ALGO_SHA256,
            default => null,
        };

        if ($algorithm === null) {
            return false;
        }

        $certUrl = (string) ($envelope['SigningCertURL'] ?? '');

        if (!$this->isSnsUrl($certUrl)
            || !str_ends_with(strtolower((string) parse_url($certUrl, PHP_URL_PATH)), '.pem')) {
            return false;
        }

        $signature = base64_decode((string) ($envelope['Signature'] ?? ''), true);

        if (!is_string($signature) || $signature === '') {
            return false;
        }

        $canonical = $this->canonicalString($envelope);

        if ($canonical === null) {
            return false;
        }

        $pem = $this->signingCertificate($certUrl);

        if ($pem === null) {
            return false;
        }

        try {
            $key = openssl_pkey_get_public($pem);

            return $key !== false && openssl_verify($canonical, $signature, $key, $algorithm) === 1;
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * The string SNS signed: the named fields, in this order, each as
     * "Name\nvalue\n". Subject is included only when present on a
     * Notification; a missing required field means the message is not
     * verifiable and is refused.
     */
    private function canonicalString(array $envelope): ?string
    {
        $fields = match ($envelope['Type'] ?? null) {
            'Notification'                                     => ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
            'SubscriptionConfirmation', 'UnsubscribeConfirmation' => ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
            default                                            => null,
        };

        if ($fields === null) {
            return null;
        }

        $canonical = '';

        foreach ($fields as $field) {
            if (!array_key_exists($field, $envelope)) {
                if ($field === 'Subject') {
                    continue;
                }

                return null;
            }

            if (!is_scalar($envelope[$field])) {
                return null;
            }

            $canonical .= $field . "\n" . $envelope[$field] . "\n";
        }

        return $canonical;
    }

    /** https, on sns.<region>.amazonaws.com, no credentials or port smuggled in. */
    private function isSnsUrl(string $url): bool
    {
        $parts = parse_url($url);

        return is_array($parts)
            && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
            && preg_match(self::SNS_HOST, strtolower((string) ($parts['host'] ?? ''))) === 1
            && empty($parts['user'])
            && empty($parts['pass'])
            && empty($parts['port']);
    }

    /** The signing certificate, fetched once and cached; null when it cannot be had or is not a certificate. */
    private function signingCertificate(string $url): ?string
    {
        $cacheKey = 'sns_signing_cert:' . sha1($url);
        $cached   = Cache::get($cacheKey);

        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        try {
            $response = Http::timeout(10)->get($url);
        } catch (\Throwable $e) {
            Log::warning('SES webhook: could not fetch the SNS signing certificate', ['error' => $e->getMessage()]);
            return null;
        }

        if (!$response->successful()) {
            return null;
        }

        $pem = $response->body();

        try {
            if (openssl_x509_read($pem) === false) {
                return null;
            }
        } catch (\Throwable) {
            return null;
        }

        Cache::put($cacheKey, $pem, self::CERT_TTL_SECONDS);

        return $pem;
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
        $bounce      = $message['bounce'] ?? [];
        $isPermanent = ($bounce['bounceType'] ?? '') === 'Permanent';
        $subType     = (string) ($bounce['bounceSubType'] ?? '');

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
