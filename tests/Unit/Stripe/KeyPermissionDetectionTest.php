<?php

namespace Tests\Unit\Stripe;

use App\Services\StripeService;
use PHPUnit\Framework\TestCase;

/**
 * Locks StripeService's key-permission + authentication classifier
 * + the actionable-message builders (June 1 2026 ship).
 *
 * Two distinct customer error states, two distinct fixes:
 *
 *   isRestrictedKeyPermissionError($e) → string|null
 *     The customer's Stripe key (rk_live_*) is VALID but missing a
 *     scope (e.g. refunds:write). Returns the scope id so caller
 *     can deep-link to Dashboard → Edit key → toggle scope.
 *     Forrest Glamp's prod outage where every refund failed
 *     silently with cryptic Stripe errors — until we surfaced
 *     the actionable URL.
 *
 *   isAuthenticationError($e) → bool
 *     The customer's Stripe key is INVALID (revoked, rotated,
 *     malformed). Different fix: re-paste a fresh key. Conflating
 *     this with permission failure makes the wrong message appear
 *     and customers waste time toggling scopes that won't help.
 *
 * Returns + message helpers tested as pure functions — no DB / no
 * boot / no real Stripe call.
 */
class KeyPermissionDetectionTest extends TestCase
{
    /** Construct a Stripe exception with optional HTTP status + code. */
    private function makeStripeException(string $class, string $msg, ?int $httpStatus = null, ?string $stripeCode = null): \Throwable
    {
        // Stripe SDK exposes ::factory() on every concrete exception class
        // as the documented construction path. Without httpStatus/code the
        // exception still has the right CLASS (the most stable signal in
        // the classifier).
        return $class::factory($msg, $httpStatus, null, null, null, $stripeCode);
    }

    /* ─── isRestrictedKeyPermissionError — POSITIVE matches ─── */

    public function test_permission_exception_class_matches(): void
    {
        // The canonical "your key lacks this scope" Stripe exception.
        $e = $this->makeStripeException(
            \Stripe\Exception\PermissionException::class,
            'The provided key does not have access to refunds.',
            403,
            'insufficient_permissions',
        );

        $result = StripeService::isRestrictedKeyPermissionError($e);
        $this->assertNotNull($result,
            'PermissionException MUST always classify as restricted-key.');
        $this->assertSame('refunds:write', $result,
            'Resource extracted from "access to <resource>" pattern.');
    }

    public function test_insufficient_permissions_stripe_code_matches(): void
    {
        // Some restricted-key errors come back as InvalidRequestException
        // with the stripe-code set — match on the code, not just class.
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'The provided key does not have access to refunds.',
            403,
            'insufficient_permissions',
        );

        $this->assertNotNull(StripeService::isRestrictedKeyPermissionError($e));
    }

    public function test_permission_denied_stripe_code_matches(): void
    {
        // Stripe sometimes returns `permission_denied` instead of
        // `insufficient_permissions` (the codes are interchangeable per
        // docs). Both MUST classify. Use InvalidRequestException as
        // the concrete carrier (ApiErrorException itself is abstract).
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'You do not have permission to refund this charge.',
            403,
            'permission_denied',
        );

        $this->assertNotNull(StripeService::isRestrictedKeyPermissionError($e));
    }

    public function test_http_403_on_apierror_matches_even_without_stripe_code(): void
    {
        // Defensive: a 403 from Stripe with no stripe-code set still
        // classifies via HTTP status. Pre-fix only the message regex
        // could catch this, and that's fragile across Stripe error
        // text revisions. Concrete InvalidRequestException stands in
        // for the abstract ApiErrorException base.
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'Restricted access',
            403,
            null,
        );

        $this->assertNotNull(StripeService::isRestrictedKeyPermissionError($e));
    }

    public function test_invalid_request_with_does_not_have_access_message_matches(): void
    {
        // Text-pattern fallback for older Stripe SDK versions that
        // didn't expose getStripeCode reliably.
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            "The provided key 'rk_live_***' does not have access to refunds.",
        );

        $this->assertNotNull(StripeService::isRestrictedKeyPermissionError($e));
    }

    public function test_invalid_request_with_you_do_not_have_permission_message_matches(): void
    {
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            "You do not have permission to perform this request.",
        );

        $this->assertNotNull(StripeService::isRestrictedKeyPermissionError($e));
    }

    /* ─── isRestrictedKeyPermissionError — scope extraction ─── */

    public function test_extracts_refunds_scope_from_access_to_pattern(): void
    {
        // The "Fix it in 30 sec" UX hinges on extracting the right
        // scope id so we can tell the user EXACTLY which checkbox
        // to flip.
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'The provided key does not have access to refunds.',
        );

        $this->assertSame('refunds:write',
            StripeService::isRestrictedKeyPermissionError($e),
        );
    }

    public function test_extracts_charges_scope_from_on_pattern(): void
    {
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            "You do not have permission to perform this request on 'charges'.",
        );

        $this->assertSame('charges:write',
            StripeService::isRestrictedKeyPermissionError($e),
        );
    }

    public function test_unknown_resource_falls_back_to_unknown_scope(): void
    {
        // Defensive: when message doesn't match any known scope
        // pattern, return 'unknown:write' so the caller still gets
        // a non-null signal (something is wrong) without us
        // guessing a wrong scope.
        $e = $this->makeStripeException(
            \Stripe\Exception\PermissionException::class,
            'Restricted',
            403,
        );

        $this->assertSame('unknown:write',
            StripeService::isRestrictedKeyPermissionError($e),
        );
    }

    /* ─── isRestrictedKeyPermissionError — NEGATIVE (must NOT match) ─── */

    public function test_authentication_exception_does_not_match_as_permission(): void
    {
        // CRITICAL: do NOT classify auth errors as restricted-key.
        // Pre-fix the message-regex path matched any "key" string,
        // including AuthenticationException messages, causing users
        // to chase a scope toggle for a revoked key.
        $e = $this->makeStripeException(
            \Stripe\Exception\AuthenticationException::class,
            'Invalid API Key provided',
            401,
        );

        $this->assertNull(StripeService::isRestrictedKeyPermissionError($e),
            'AuthenticationException MUST NOT classify as restricted-key.');
    }

    public function test_plain_runtime_exception_does_not_match(): void
    {
        // Defensive: a generic non-Stripe error never matches.
        $this->assertNull(
            StripeService::isRestrictedKeyPermissionError(new \RuntimeException('something else broke')),
        );
    }

    public function test_invalid_request_unrelated_message_does_not_match(): void
    {
        // An InvalidRequestException with a normal "param X required"
        // message must NOT classify as restricted-key.
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'Parameter unit_id is required.',
        );

        $this->assertNull(StripeService::isRestrictedKeyPermissionError($e));
    }

    /* ─── restrictedKeyMessage — the actionable copy ─── */

    public function test_restricted_key_message_includes_dashboard_url(): void
    {
        $msg = StripeService::restrictedKeyMessage('refunds', 'refunds:write');

        $this->assertStringContainsString(
            'https://dashboard.stripe.com/apikeys',
            $msg,
            'Message MUST deep-link to Dashboard Edit-key page so customers can fix in 30 sec.',
        );
        $this->assertStringContainsString('refunds:write', $msg,
            'Scope id MUST surface so customer knows which toggle to flip.');
    }

    public function test_restricted_key_message_with_pi_includes_manual_refund_url(): void
    {
        // Per the ship docblock: the manual refund url lets staff
        // close the loop NOW while the key fix is pending.
        $msg = StripeService::restrictedKeyMessage(
            'refunds',
            'refunds:write',
            'pi_test_actionable_12345',
        );

        $this->assertStringContainsString(
            'https://dashboard.stripe.com/payments/pi_test_actionable_12345',
            $msg,
            'PI URL MUST surface so staff can refund manually while key fix is pending.',
        );
    }

    public function test_restricted_key_message_without_pi_omits_manual_url(): void
    {
        $msg = StripeService::restrictedKeyMessage('refunds', 'refunds:write');
        $this->assertStringNotContainsString('dashboard.stripe.com/payments/', $msg);
    }

    /* ─── isAuthenticationError ─── */

    public function test_authentication_exception_class_matches(): void
    {
        $e = $this->makeStripeException(
            \Stripe\Exception\AuthenticationException::class,
            'Invalid API Key provided',
            401,
        );

        $this->assertTrue(StripeService::isAuthenticationError($e),
            'AuthenticationException MUST classify as auth failure.');
    }

    public function test_http_401_on_concrete_apierror_matches_as_authentication(): void
    {
        // Defense in depth — a 401 from any concrete ApiErrorException
        // subclass (Stripe SDK can route auth failures through several
        // subclasses depending on the endpoint) still classifies as
        // auth. Use UnknownApiErrorException as the concrete carrier
        // since the base ApiErrorException is abstract.
        $e = $this->makeStripeException(
            \Stripe\Exception\UnknownApiErrorException::class,
            'No auth',
            401,
        );

        $this->assertTrue(StripeService::isAuthenticationError($e));
    }

    public function test_http_401_with_permissions_code_does_not_match_as_authentication(): void
    {
        // CRITICAL guard: a 401 that ALSO carries the
        // insufficient_permissions stripe-code is a missing-scope
        // error (some Stripe edge paths return 401 + perm code).
        // MUST classify as permission, NOT auth — flipping that
        // tells the user to re-paste a perfectly valid key.
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'Restricted',
            401,
            'insufficient_permissions',
        );

        $this->assertFalse(StripeService::isAuthenticationError($e),
            'HTTP 401 + permission code MUST NOT classify as auth — it is missing scope.');
    }

    public function test_permission_exception_does_not_match_as_authentication(): void
    {
        // The two classifiers MUST be mutually exclusive on the
        // canonical exception classes — same error MUST NOT match
        // both.
        $e = $this->makeStripeException(
            \Stripe\Exception\PermissionException::class,
            'Missing scope',
            403,
            'insufficient_permissions',
        );

        $this->assertFalse(StripeService::isAuthenticationError($e),
            'PermissionException is NOT an auth error.');
    }

    public function test_invalid_request_does_not_match_as_authentication(): void
    {
        $e = $this->makeStripeException(
            \Stripe\Exception\InvalidRequestException::class,
            'Missing parameter',
            400,
        );

        $this->assertFalse(StripeService::isAuthenticationError($e));
    }

    public function test_plain_runtime_exception_does_not_match_as_authentication(): void
    {
        $this->assertFalse(
            StripeService::isAuthenticationError(new \RuntimeException('not stripe')),
        );
    }

    /* ─── authenticationErrorMessage ─── */

    public function test_authentication_error_message_includes_dashboard_url(): void
    {
        $msg = StripeService::authenticationErrorMessage();

        $this->assertStringContainsString(
            'https://dashboard.stripe.com/apikeys',
            $msg,
            'Auth-error message MUST link to apikeys page for re-paste flow.',
        );
        $this->assertStringContainsString('re-paste', $msg,
            'Action verb MUST surface so user knows the fix is paste-a-fresh-key, not toggle-a-scope.');
    }

    /* ─── Cross-check: the two classifiers don't overlap on common cases ─── */

    public function test_classifiers_are_mutually_exclusive_on_canonical_cases(): void
    {
        $permission = $this->makeStripeException(
            \Stripe\Exception\PermissionException::class,
            'Missing scope refunds',
            403,
            'insufficient_permissions',
        );
        $auth = $this->makeStripeException(
            \Stripe\Exception\AuthenticationException::class,
            'Invalid key',
            401,
        );

        // permission MUST classify only as restricted-key
        $this->assertNotNull(StripeService::isRestrictedKeyPermissionError($permission));
        $this->assertFalse(StripeService::isAuthenticationError($permission));

        // auth MUST classify only as authentication
        $this->assertNull(StripeService::isRestrictedKeyPermissionError($auth));
        $this->assertTrue(StripeService::isAuthenticationError($auth));
    }
}
