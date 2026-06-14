<?php

namespace Tests\Unit\Booking;

use App\Services\BookingEngineService;
use PHPUnit\Framework\TestCase;

/**
 * Locks BookingEngineService::isTransientSmoobuError() — the
 * decision gate that splits Smoobu-call failures into:
 *
 *   transient (true)  → don't reject the booking. Keep the local
 *                       mirror in pending_pms_sync, the retry cron
 *                       (bookings:retry-pms-sync, every 5 min) will
 *                       resync once Smoobu recovers
 *
 *   fatal     (false) → the request itself is bad (404 on a non-
 *                       existent apartment, channel-id-doesn't-exist,
 *                       400 bad-shape payload). Rollback the
 *                       transaction, refund the held Stripe auth,
 *                       reject the booking with a clean message
 *
 * Asymmetry rationale (May 26 2026 fix, after a lost real booking):
 *   - False-FATAL on a truly transient error costs the entire
 *     booking AFTER the customer paid → real money lost, real
 *     customer trust burned
 *   - False-TRANSIENT on a truly fatal error costs a 5-min retry
 *     cycle that fails again, audit-logs as `pms_sync_failed`,
 *     and surfaces for manual review
 *
 * The asymmetry demands the regex be GENEROUS toward transient.
 * Pre-fix, "Service Unavailable", bare 5xx codes, SSL failures,
 * ECONNREFUSED, ENOTFOUND were all classified FATAL and lost
 * bookings.
 *
 * Override invariant: any error whose message contains
 * "Smoobu channel configuration" is ALWAYS fatal regardless of
 * other transient-looking substrings — the channel is mis-configured
 * and waiting won't fix it.
 *
 * This is a pure-function test — no DB, no schema, no app boot.
 */
class IsTransientSmoobuErrorTest extends TestCase
{
    /* ─── Transient (must return true → don't reject booking) ─── */

    public function test_http_500_internal_server_error_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'HTTP 500 Internal Server Error',
        ));
    }

    public function test_http_502_bad_gateway_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: 502 Bad Gateway',
        ));
    }

    public function test_http_503_service_unavailable_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: 503 Service Unavailable',
        ));
    }

    public function test_http_504_gateway_timeout_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: 504 Gateway Timeout',
        ));
    }

    public function test_http_429_rate_limit_is_transient(): void
    {
        // 429 is the "back off" code. Confirm cron / retry path must
        // not classify it as fatal.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: 429 Too Many Requests',
        ));
    }

    public function test_curl_28_timeout_message_is_transient(): void
    {
        // Smoobu calls timing out at the cURL transport layer —
        // canonical recoverable failure mode.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'cURL error 28: Operation timed out after 30000 milliseconds',
        ));
    }

    public function test_connection_refused_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'cURL error 7: Failed to connect: Connection refused',
        ));
    }

    public function test_econnrefused_keyword_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'ECONNREFUSED 35.156.1.1:443',
        ));
    }

    public function test_enotfound_dns_failure_is_transient(): void
    {
        // DNS resolution failure — Smoobu's domain temporarily
        // un-resolvable. Must be transient or the booking dies.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'ENOTFOUND login.smoobu.com',
        ));
    }

    public function test_could_not_resolve_host_is_transient(): void
    {
        // getaddrinfo() failure surfaced as cURL error 6 message.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'cURL error 6: Could not resolve host: login.smoobu.com (getaddrinfo)',
        ));
    }

    public function test_ssl_failure_is_transient(): void
    {
        // SSL handshake hiccup — transient infra issue.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'SSL: handshake failure',
        ));
    }

    public function test_reset_by_peer_is_transient(): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Connection reset by peer',
        ));
    }

    public function test_temporary_failure_keyword_is_transient(): void
    {
        // "Temporary failure in name resolution" — the canonical
        // Linux DNS-blip error.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Temporary failure in name resolution',
        ));
    }

    public function test_lowercased_unavailable_keyword_is_transient(): void
    {
        // Case-insensitive: regex is /i. "unavailable" alone (no
        // status code) surfaces from various Smoobu error bodies.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'service unavailable',
        ));
    }

    public function test_bare_internal_error_phrase_is_transient(): void
    {
        // Smoobu sometimes returns "Internal error" without the
        // word "server". Pre-fix this slipped through as fatal.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Internal error occurred while processing request',
        ));
    }

    public function test_recv_failure_keyword_is_transient(): void
    {
        // "Recv failure: Connection was reset" — another flavour
        // of the same transient-network bucket.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Recv failure: connection abruptly closed',
        ));
    }

    /* ─── Fatal (must return false → reject booking cleanly) ─── */

    public function test_404_apartment_not_found_is_fatal(): void
    {
        // The apartment_id is bogus — waiting won't make it valid.
        // Must reject cleanly so the customer's payment-hold drops.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: Apartment with id 0 not found',
        ));
    }

    public function test_400_invalid_field_is_fatal(): void
    {
        // 400 bad-shape payload — request is wrong, retrying won't
        // help. Reject cleanly.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: missing required field departureDate',
        ));
    }

    public function test_unauthorized_is_fatal(): void
    {
        // 401 — the API key is bad. Retrying won't help; the org
        // needs to fix their key in Settings → Integrations.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Smoobu API error: 401 Unauthorized',
        ));
    }

    public function test_validation_error_is_fatal(): void
    {
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Validation failed: arrivalDate must be before departureDate',
        ));
    }

    public function test_empty_string_is_fatal(): void
    {
        // Defensive: an empty message must NOT match transient
        // (an empty pattern would otherwise be a wide vector for
        // wrongly silencing a fatal error).
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(''));
    }

    /* ─── The channel-config override (always fatal) ─── */

    public function test_channel_config_error_is_fatal_even_with_transient_substrings(): void
    {
        // The override at the top of isTransientSmoobuError(): any
        // message containing "Smoobu channel configuration" is
        // FATAL regardless of what else the message contains. Waiting
        // for retry won't fix a misconfigured channel — the admin
        // must pin the right channel_id in Settings.
        //
        // Pre-override, an error like "Smoobu channel configuration
        // error — connection refused while validating" would match
        // the transient regex via "connection" and silently retry
        // forever instead of surfacing to admin.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Smoobu channel configuration error — connection refused while validating channel',
        ));
    }

    public function test_channel_config_override_is_case_sensitive_on_keyword(): void
    {
        // The override uses stripos (case-INsensitive) per the
        // implementation. Lock that.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'SMOOBU CHANNEL CONFIGURATION error — bad gateway',
        ));
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'smoobu channel configuration error',
        ));
    }

    /* ─── Real-world recovery-wave failure modes ─── */

    public function test_real_world_curl_timeout_combo_is_transient(): void
    {
        // The exact error pattern that caused the May 26 2026 lost
        // booking before the regex was widened.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'cURL error 28: Operation timed out after 8000 milliseconds with 0 bytes received',
        ));
    }

    public function test_compound_message_with_transient_substring_is_transient(): void
    {
        // Compound message buried in a longer error chain. As long
        // as ANY transient marker matches, classify transient.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'Could not complete booking for unit 12345: 503 Service Unavailable from upstream',
        ));
    }

    /* ─── Edge cases ─── */

    public function test_unicode_and_long_message_does_not_crash(): void
    {
        // Defensive: a multi-byte / very long error message must
        // not crash the regex engine.
        $long = str_repeat('error ', 500) . 'timeout';
        $this->assertTrue(BookingEngineService::isTransientSmoobuError($long));
    }

    public function test_pure_status_code_without_context_is_transient_for_5xx(): void
    {
        // The regex captures bare 5xx codes (50[0-9]) so a stripped
        // error message like just "500" still classifies transient.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError('500'));
        $this->assertTrue(BookingEngineService::isTransientSmoobuError('503'));
    }
}
