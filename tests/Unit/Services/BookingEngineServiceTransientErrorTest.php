<?php

namespace Tests\Unit\Services;

use App\Services\BookingEngineService;
use PHPUnit\Framework\TestCase;

/**
 * Locks the Smoobu error classifier — the helper that decides whether
 * a createReservation exception is TRANSIENT (retry-safe, local-only
 * mirror) or FATAL (rollback after payment).
 *
 * The asymmetry the production code is built on (from CLAUDE.md
 * 2026-05-26 booking robustness wave):
 *
 *   - False-transient → recoverable: a local-only BookingMirror gets
 *     created with internal_status='pending_pms_sync' and the retry
 *     cron picks it up on a 5-minute tick.
 *   - False-fatal → LOST BOOKING after the guest already paid.
 *
 * Because false-fatal is the worse failure mode, the classifier is
 * deliberately GENEROUS toward transient — any infrastructure-shaped
 * error (HTML proxy pages, "Service Unavailable", DNS, SSL, timeouts,
 * 5xx, 429) routes to the recoverable bucket.
 *
 * What this test does NOT cover:
 *   - The OUTER catch path in confirm() that handles the classified
 *     result (audit logging, transaction rollback). That's covered
 *     by the integration tests in BookingEngineServiceConfirmTest.
 *   - Real Smoobu API calls. The classifier operates on the EXCEPTION
 *     MESSAGE only — no real Smoobu round-trip needed.
 *
 * Why this is a unit test (PHPUnit\TestCase, no Laravel TestCase):
 * isTransientSmoobuError() is a static helper with no DB, no facade,
 * no app() touch. Wall time stays in the millisecond range.
 */
class BookingEngineServiceTransientErrorTest extends TestCase
{
    /**
     * @testWith ["HTTP 500 Internal Server Error from Smoobu"]
     *           ["HTTP 502 Bad Gateway"]
     *           ["HTTP 503 Service Unavailable"]
     *           ["HTTP 504 Gateway Timeout"]
     *           ["HTTP/500 returned by upstream"]
     */
    public function test_5xx_status_codes_are_transient(string $msg): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError($msg),
            "5xx-shaped error '{$msg}' must be classified as transient.");
    }

    public function test_rate_limit_429_is_transient(): void
    {
        // 429 means "we're going too fast" — retry after backoff
        // resolves it. Without this classification the cron would
        // see a 429 and roll back a booking that would have succeeded
        // 250ms later.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'HTTP 429 Too Many Requests — rate limit exceeded'
        ));
    }

    /**
     * @testWith ["cURL error 28: Operation timed out"]
     *           ["Connection timeout after 30 seconds"]
     *           ["Request timed out"]
     *           ["Network connection lost"]
     */
    public function test_timeout_and_network_errors_are_transient(string $msg): void
    {
        $this->assertTrue(BookingEngineService::isTransientSmoobuError($msg),
            "Network-shaped error '{$msg}' must be classified as transient.");
    }

    /**
     * @testWith ["cURL error 6: Could not resolve host: login.smoobu.com"]
     *           ["getaddrinfo failure"]
     *           ["ECONNREFUSED 127.0.0.1:443"]
     *           ["ENOTFOUND login.smoobu.com"]
     *           ["Connection reset by peer"]
     */
    public function test_dns_and_socket_errors_are_transient(string $msg): void
    {
        // DNS + socket-level failures are infrastructure events —
        // retry resolves them. Critical for the false-fatal asymmetry
        // because these errors can flap on shared DNS / network blips
        // and would otherwise tank a paid booking.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError($msg),
            "Socket-shaped error '{$msg}' must be classified as transient.");
    }

    public function test_ssl_handshake_failures_are_transient(): void
    {
        // SSL handshake errors can be cert-rotation blips, intermediate
        // CA fetch failures, OCSP staple problems, etc. — retry-safe.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError(
            'SSL handshake failed during connection'
        ));
    }

    /**
     * @testWith ["The service is temporarily unavailable. Please try again."]
     *           ["Service Unavailable"]
     *           ["Internal Server Error"]
     *           ["Bad Gateway"]
     */
    public function test_human_readable_infrastructure_strings_are_transient(string $msg): void
    {
        // Proxy-side error PAGES often deliver these strings as plain
        // text without HTTP status codes attached. Generous matching
        // catches them so we don't false-fatal an infrastructure blip.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError($msg),
            "Infrastructure-keyword error '{$msg}' must be classified as transient.");
    }

    public function test_4xx_business_errors_are_fatal(): void
    {
        // 4xx errors (bad request, missing required field) are NOT
        // recoverable by retry — they're misconfigurations or stale
        // hold state. Must be classified as fatal so confirm()
        // rolls back instead of leaving the guest with a pending PI
        // that'll fail again on every cron tick.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'HTTP 400 Bad Request — apartmentId is required'
        ));
    }

    public function test_apartment_id_not_found_is_fatal(): void
    {
        // The canonical "this room doesn't exist anymore" error from
        // Smoobu. Retry will fail every time — must be fatal so the
        // user sees an actionable error.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Apartment with id 0 not found'
        ));
    }

    public function test_channel_configuration_error_is_always_fatal(): void
    {
        // The override case: "Smoobu channel configuration" errors
        // from resolveDirectChannelId() are ALWAYS fatal. A retry
        // won't fix a misconfigured channel — needs a human in the
        // loop. This is the fix that confirmCombo() was missing
        // before this commit's helper extraction.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Smoobu channel configuration error — no valid Direct channel'
        ));
    }

    public function test_channel_configuration_override_beats_transient_substring(): void
    {
        // CRITICAL: the override must win even when the error message
        // contains a transient-sounding sub-string. Without this
        // guard, a "Smoobu channel configuration: 503 service
        // unavailable" message would route to transient and the
        // retry cron would burn through 5 attempts on a config issue
        // that needs a human fix.
        $msg = 'Smoobu channel configuration — service unavailable on the channel endpoint';

        $this->assertFalse(BookingEngineService::isTransientSmoobuError($msg),
            'Channel-config override must beat transient-keyword sub-strings.');
    }

    public function test_unknown_error_message_defaults_to_fatal(): void
    {
        // When neither the transient regex matches NOR the channel-
        // config override fires, the classifier returns false (fatal).
        // This is the DEFAULT case — fatal-by-default is the safer
        // failure mode when uncertain because false-transient creates
        // an orphan local mirror but false-fatal at least rolls back
        // cleanly with the guest's PI uncaptured.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(
            'Some entirely unrecognised vendor-specific error code'
        ));
    }

    public function test_empty_string_is_fatal_by_default(): void
    {
        // Defensive guard: an empty message string must not match
        // the transient regex.
        $this->assertFalse(BookingEngineService::isTransientSmoobuError(''));
    }

    public function test_case_insensitive_match(): void
    {
        // The regex has /i flag — must match transient keywords
        // regardless of case. Real Smoobu / Laravel exception
        // messages can emit any casing.
        $this->assertTrue(BookingEngineService::isTransientSmoobuError('TIMEOUT'));
        $this->assertTrue(BookingEngineService::isTransientSmoobuError('Service UNAVAILABLE'));
        $this->assertTrue(BookingEngineService::isTransientSmoobuError('ssl handshake'));
    }
}
