<?php

namespace Tests\Unit\Services;

use App\Services\StripeService;
use PHPUnit\Framework\TestCase;
use Stripe\Exception\AuthenticationException;
use Stripe\Exception\InvalidRequestException;
use Stripe\Exception\PermissionException;

/**
 * Locks the StripeService static helpers that classify Stripe SDK
 * exceptions into actionable categories. These helpers are the
 * load-bearing surface that turns Stripe's terse error messages into
 * the "Fix in 30 sec: open dashboard..." copy customers actually act
 * on — directly responsible for the Forrest Glamp recovery being
 * tractable instead of an hour-long support escalation per refund
 * attempt.
 *
 * Three concrete contract surfaces:
 *
 *   1. isRestrictedKeyPermissionError(\Throwable): ?string
 *      Returns the inferred scope name (e.g. "refunds:write") when
 *      the exception indicates a restricted-key missing-scope failure,
 *      or null otherwise. Callers branch on the truthy/null distinction.
 *      Five detection paths (stripe code, HTTP 403, PermissionException
 *      class, "does not have access" regex, "You do not have permission"
 *      regex) must all agree on the same classification.
 *
 *   2. restrictedKeyMessage(string $operation, string $scope, ?string $pi): string
 *      Templates the customer-facing actionable message. Must contain
 *      the dashboard URL + the operation name + the scope name. When
 *      a PI is provided, must also include the per-PI dashboard URL
 *      so staff can refund manually as a workaround.
 *
 *   3. isAuthenticationError(\Throwable): bool
 *      Distinguishes "key is no longer valid" (revoked/rotated/malformed)
 *      from "key is valid but lacks scope". Without this split, every
 *      auth failure would route to the same "enable scope" message and
 *      confuse staff whose key was actually rotated.
 *
 * No DB required. Tests synthesise Stripe SDK exceptions in-process
 * via the SDK's own factory method + the protected-property setters.
 */
class StripeServiceHelpersTest extends TestCase
{
    public function test_permission_exception_class_is_classified_as_restricted_key_error(): void
    {
        // The most direct signal: Stripe SDK explicitly threw a
        // PermissionException. Must return a non-null scope.
        $e = PermissionException::factory(
            'The provided key does not have access to refunds.',
            403,
        );

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertNotNull($scope,
            'PermissionException must classify as a restricted-key error.');
        $this->assertSame('refunds:write', $scope,
            'Scope should be inferred from the "access to {resource}" pattern.');
    }

    public function test_invalid_request_with_does_not_have_access_text_matches(): void
    {
        // Older Stripe responses sometimes wrap the same problem in
        // InvalidRequestException. The regex on the message text is
        // the fallback when the exception class doesn't disambiguate.
        $e = InvalidRequestException::factory(
            "The provided key 'rk_live_***' does not have access to refunds.",
        );

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertSame('refunds:write', $scope);
    }

    public function test_http_403_on_api_error_exception_is_classified_as_restricted(): void
    {
        // Defense-in-depth pathway: HTTP 403 from any ApiErrorException
        // descendant counts even when the Stripe SDK didn't pick a
        // PermissionException subclass. Audit 2026-06-01 finding —
        // SDK can return generic InvalidRequestException with status 403
        // when the resource itself isn't even visible to the restricted key.
        $e = InvalidRequestException::factory(
            'Some opaque error',
            403,
        );

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertNotNull($scope,
            'HTTP 403 on ApiErrorException must classify even without text match.');
    }

    public function test_stripe_code_insufficient_permissions_is_classified(): void
    {
        // The most stable signal per Stripe docs: stripeCode = 'insufficient_permissions'.
        // Text matchers come and go; the code is documented + stable.
        $e = InvalidRequestException::factory('opaque');
        $e->setStripeCode('insufficient_permissions');

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertNotNull($scope);
    }

    public function test_stripe_code_permission_denied_is_classified(): void
    {
        // Sibling code that Stripe also emits for the same condition.
        $e = InvalidRequestException::factory('opaque');
        $e->setStripeCode('permission_denied');

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertNotNull($scope);
    }

    public function test_required_resource_underscore_pattern_extracts_full_scope(): void
    {
        // Some Stripe error messages emit "Required: refunds_write" (with
        // the underscore-separated read/write suffix). The helper returns
        // the full "{resource}:{verb}" form directly when that pattern hits.
        // The message also has to satisfy the outer pre-check matcher —
        // we use the "You do not have permission" phrase for that gate,
        // then verify the Required-pattern extracts the more specific
        // scope (preferred over the resource-only pattern).
        $e = InvalidRequestException::factory(
            'You do not have permission. Required: refunds_write',
        );

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertSame('refunds:write', $scope,
            'Required: {resource}_{verb} pattern must yield {resource}:{verb}.');
    }

    public function test_you_do_not_have_permission_on_resource_pattern_matches(): void
    {
        // Third regex pattern — Stripe's plain-English variant. Must
        // extract the quoted resource name from the message.
        $e = InvalidRequestException::factory(
            "You do not have permission to perform this request on 'refunds'.",
        );

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertSame('refunds:write', $scope);
    }

    public function test_unrelated_invalid_request_does_not_misclassify(): void
    {
        // Critical false-positive guard: ordinary "amount must be ≥ 50"
        // / "no such customer" InvalidRequestExceptions must NOT classify
        // as restricted-key errors. Otherwise every Stripe error would
        // route customers to "fix your key permissions" which is wrong
        // and tanks support throughput.
        $e = InvalidRequestException::factory(
            'No such customer: cus_does_not_exist',
            404,
        );

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertNull($scope,
            'Ordinary InvalidRequestException must NOT classify as restricted-key.');
    }

    public function test_non_stripe_exception_returns_null(): void
    {
        // Garbage-in guard: arbitrary \Throwable that ISN'T a Stripe
        // exception must return null. Without this, an outer catch
        // block that runs on every Throwable would route DB errors,
        // PHP errors, network errors, etc. all into the restricted-key
        // bucket.
        $e = new \RuntimeException('Something else entirely went wrong');

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertNull($scope);
    }

    public function test_permission_exception_with_no_resource_text_falls_back_to_unknown_write(): void
    {
        // When PermissionException class matches but the message gives
        // no resource hint, the helper falls back to "unknown:write" so
        // the caller still has something to template into the actionable
        // message. Better a vague "enable the missing scope" than null.
        $e = PermissionException::factory('Access denied', 403);

        $scope = StripeService::isRestrictedKeyPermissionError($e);

        $this->assertSame('unknown:write', $scope,
            'Fallback when no resource pattern matches must be unknown:write.');
    }

    public function test_restricted_key_message_includes_operation_scope_and_dashboard_url(): void
    {
        // Contract on the customer-facing message: must contain the
        // operation name, the scope (so they know what to flip), and
        // the dashboard URL (so they can actually go fix it).
        $msg = StripeService::restrictedKeyMessage('refunds', 'refunds:write');

        $this->assertStringContainsString('refunds', $msg,
            'Operation name must appear in the message.');
        $this->assertStringContainsString('refunds:write', $msg,
            'Scope must appear in the message so admin knows what to flip.');
        $this->assertStringContainsString('https://dashboard.stripe.com/apikeys', $msg,
            'Stripe Dashboard API keys URL must be in the message — no Google needed.');
    }

    public function test_restricted_key_message_includes_pi_dashboard_link_when_provided(): void
    {
        // When the caller has a PI, the message includes a direct
        // dashboard link so staff can refund manually as a workaround
        // while the key gets fixed. Without this, ops gets stuck on
        // "how do I find this specific charge in dashboard."
        $piId = 'pi_3Td7MrAEuOb3OkvF1wMfJYHI';

        $msg = StripeService::restrictedKeyMessage('refunds', 'refunds:write', $piId);

        $this->assertStringContainsString("https://dashboard.stripe.com/payments/{$piId}", $msg,
            'PI-specific dashboard URL must appear when PI provided.');
    }

    public function test_restricted_key_message_omits_pi_link_when_pi_null(): void
    {
        // The dashboard/payments URL must NOT be templated when caller
        // didn't pass a PI — otherwise we'd link to /payments/ which
        // 404s in the Stripe dashboard.
        $msg = StripeService::restrictedKeyMessage('refunds', 'refunds:write', null);

        $this->assertStringNotContainsString('dashboard.stripe.com/payments/', $msg,
            'PI URL must not appear when PI argument is null.');
    }

    public function test_authentication_exception_is_classified_as_auth_error(): void
    {
        // Distinct from missing-scope: this means the key itself is no
        // longer valid (revoked, rotated, malformed). Caller routes to
        // "re-paste your key" message instead of "enable the scope".
        $e = AuthenticationException::factory(
            'Invalid API Key provided: rk_live_***',
            401,
        );

        $this->assertTrue(StripeService::isAuthenticationError($e));
    }

    public function test_http_401_on_api_error_exception_is_auth_error(): void
    {
        // Defense-in-depth: HTTP 401 from any ApiErrorException counts
        // as auth, regardless of the specific exception subclass —
        // EXCEPT when the stripeCode says it's actually a permission
        // problem (those are routed to the missing-scope helper).
        $e = InvalidRequestException::factory('Invalid key', 401);

        $this->assertTrue(StripeService::isAuthenticationError($e));
    }

    public function test_http_401_with_permission_denied_code_is_NOT_auth_error(): void
    {
        // The split: HTTP 401 + stripeCode=permission_denied is a
        // missing-scope condition, NOT a malformed-key condition.
        // Important because otherwise staff with a perfectly valid
        // restricted key gets told to "re-paste your key" — which won't
        // fix anything because the key was fine, it just lacked a scope.
        $e = InvalidRequestException::factory('Permission denied', 401);
        $e->setStripeCode('permission_denied');

        $this->assertFalse(StripeService::isAuthenticationError($e),
            'HTTP 401 with permission_denied code must route to the scope helper, not the auth helper.');
    }

    public function test_http_401_with_insufficient_permissions_code_is_NOT_auth_error(): void
    {
        // Sibling case: insufficient_permissions stripeCode also routes
        // to the scope helper not the auth helper.
        $e = InvalidRequestException::factory('Insufficient permissions', 401);
        $e->setStripeCode('insufficient_permissions');

        $this->assertFalse(StripeService::isAuthenticationError($e));
    }

    public function test_non_stripe_exception_is_not_auth_error(): void
    {
        // Garbage-in guard: ordinary PHP exception must NOT classify
        // as a Stripe auth error.
        $e = new \RuntimeException('DB connection refused');

        $this->assertFalse(StripeService::isAuthenticationError($e));
    }

    public function test_authentication_error_message_contains_actionable_paste_instruction(): void
    {
        // Contract on the canonical "re-paste your key" message. Must
        // tell the admin WHERE to go in the admin UI AND the dashboard
        // URL where the key actually lives. No staff member should have
        // to ask "OK but where do I get the key from?".
        $msg = StripeService::authenticationErrorMessage();

        $this->assertStringContainsString('https://dashboard.stripe.com/apikeys', $msg,
            'Auth error message must point at the dashboard API keys page.');
        $this->assertStringContainsString('Settings', $msg,
            'Auth error message should reference the admin Settings location to re-paste the key.');
    }
}
