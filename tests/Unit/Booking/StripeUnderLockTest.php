<?php

namespace Tests\Unit\Booking;

use App\Services\StripeService;
use PHPUnit\Framework\TestCase;
use Stripe\ApiRequestor;
use Stripe\HttpClient\CurlClient;

/**
 * Release 6, item 5: a Stripe call made while a lock is held — `pi:`, a booking
 * row, a room or slot lock, the `refund:` lock — has a short timeout (5 s to
 * connect, 15 s to read), so a slow Stripe cannot hold the lock for minutes.
 * stripe-php keeps one HTTP client per process; StripeService::underLock()
 * swaps in a short-timeout one for exactly the calls made inside it and puts
 * the previous one back afterwards — also when the call throws. Calls made
 * outside a lock keep Stripe's own defaults (30 s / 80 s).
 *
 * The second half pins, in the source, every call site that runs under a lock
 * (the suite's doubles of StripeService cannot show which HTTP client a real
 * request would use; what can be pinned is that the call is made inside
 * underLock()). A timeout there throws Stripe's ApiConnectionException — what
 * each of those callers already answers as "Stripe could not be reached":
 * PaymentUnverifiable / 503 with nothing released, a failed capture left for
 * the next run, a rescue recorded as `pi_rescue_failed`.
 */
class StripeUnderLockTest extends TestCase
{
    private ?object $before = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->before = ApiRequestor::httpClient();
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient($this->before);
        parent::tearDown();
    }

    public function test_calls_inside_run_on_a_client_with_short_timeouts_and_the_previous_one_comes_back(): void
    {
        $previous = ApiRequestor::httpClient();
        $this->assertSame(CurlClient::DEFAULT_TIMEOUT, $previous->getTimeout(), "outside a lock: Stripe's own 80 s");

        $seen = StripeService::underLock(fn () => ApiRequestor::httpClient());

        $this->assertInstanceOf(CurlClient::class, $seen);
        $this->assertSame(StripeService::LOCKED_CONNECT_TIMEOUT, $seen->getConnectTimeout());
        $this->assertSame(StripeService::LOCKED_READ_TIMEOUT, $seen->getTimeout());
        $this->assertSame(5, StripeService::LOCKED_CONNECT_TIMEOUT);
        $this->assertSame(15, StripeService::LOCKED_READ_TIMEOUT);
        $this->assertSame($previous, ApiRequestor::httpClient(), 'the client that was there before is back');
    }

    public function test_the_previous_client_comes_back_when_the_call_throws_and_the_answer_passes_through(): void
    {
        $previous = ApiRequestor::httpClient();

        try {
            StripeService::underLock(function () {
                throw new \Stripe\Exception\ApiConnectionException('Request timed out');
            });
            $this->fail('the exception must reach the caller');
        } catch (\Stripe\Exception\ApiConnectionException $e) {
            $this->assertSame('Request timed out', $e->getMessage());
        }
        $this->assertSame($previous, ApiRequestor::httpClient());
        $this->assertSame(42, StripeService::underLock(fn () => 42));
    }

    public function test_nested_calls_keep_the_short_client_until_the_outer_one_ends(): void
    {
        $previous = ApiRequestor::httpClient();

        StripeService::underLock(function () {
            StripeService::underLock(fn () => null);
            $this->assertSame(StripeService::LOCKED_READ_TIMEOUT, ApiRequestor::httpClient()->getTimeout(), 'still under the outer lock');
        });

        $this->assertSame($previous, ApiRequestor::httpClient());
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> file, method, the call that must be inside underLock() */
    public static function callSitesUnderALock(): array
    {
        return [
            'portal guard: re-check under pi:'          => ['app/Services/Booking/PortalPaymentIntentGuard.php', 'public function assertStillPayable(', 'StripeService::underLock(fn () => $this->retrieveForCheck('],
            'portal guard: mismatch cancel under pi:'   => ['app/Services/Booking/PortalPaymentIntentGuard.php', 'private function check(', 'StripeService::underLock(fn () => $this->cancel('],
            'portal guard: release under pi:'           => ['app/Services/Booking/PortalPaymentIntentGuard.php', 'public function release(', "AdvisoryLock::transaction('pi:' . \$piId, fn () => StripeService::underLock("],
            'portal guard: reuse or release under pi:'  => ['app/Services/Booking/PortalPaymentIntentGuard.php', 'public function reuseOrRelease(', "AdvisoryLock::transaction('pi:' . \$piId, fn () => StripeService::underLock("],
            'portal guard: orphan release under pi:'    => ['app/Services/Booking/PortalPaymentIntentGuard.php', 'public function releaseOrphan(', "AdvisoryLock::transaction('pi:' . \$piId, fn () => StripeService::underLock("],
            'portal stay payment-intent: hold row'      => ['app/Http/Controllers/Api/V1/Member/Portal/PortalStayBookingController.php', 'private function intentForHold(', 'StripeService::underLock(fn () => $stripe->createPaymentIntent('],
            'member cancel: appointment row + pi:'      => ['app/Services/Booking/MemberCancellation.php', 'public function cancelService(', 'DB::transaction(fn () => StripeService::underLock('],
            'member cancel: stay row + pi:'             => ['app/Services/Booking/MemberCancellation.php', 'public function cancelStay(', 'DB::transaction(fn () => StripeService::underLock('],
            'member cancel: combination rows + pi:'     => ['app/Services/Booking/MemberCancellation.php', 'private function cancelCombination(', 'DB::transaction(fn () => StripeService::underLock('],
            'capture job: stay rows + pi:'              => ['app/Console/Commands/CapturePendingPaymentIntents.php', 'private function processBooking(', 'StripeService::underLock(function () use ($stripe, $rows'],
            'capture job: appointment row + pi:'        => ['app/Console/Commands/CapturePendingPaymentIntents.php', 'private function processServiceBooking(', 'StripeService::underLock(function () use ($stripe, $fresh'],
            'public rescue: hold row + pi:'             => ['app/Http/Controllers/Api/V1/BookingPublicController.php', 'private function rescueUnderLocks(', '$outcome = StripeService::underLock($act);'],
            'engine: widget payment re-check'           => ['app/Services/BookingEngineService.php', 'private function assertWidgetPaymentStillPayable(', 'StripeService::underLock(fn () => $stripe->retrievePaymentIntent('],
            'refund: under the refund: lock'            => ['app/Services/Booking/RefundOperations.php', 'public function request(', 'StripeService::underLock(fn () => $stripe->refund('],
            'refund: retrieve under payment lock'       => ['app/Services/Booking/RefundOperations.php', 'public function request(', 'StripeService::underLock(fn () => $stripe->retrieveRefund('],
            'refund: recover old identity under lock'   => ['app/Services/Booking/RefundOperations.php', 'public function request(', 'StripeService::underLock(fn () => $stripe->refundsForPaymentIntent('],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('callSitesUnderALock')]
    public function test_a_call_made_under_a_lock_runs_inside_under_lock(string $file, string $method, string $call): void
    {
        $source = file_get_contents(dirname(__DIR__, 3) . '/' . $file);
        $this->assertIsString($source);
        $start = strpos($source, $method);
        $this->assertNotFalse($start, "{$method} not found in {$file}");
        $ends = array_filter([
            strpos($source, "\n    private function ", $start + 1),
            strpos($source, "\n    public function ", $start + 1),
            strpos($source, "\n    protected function ", $start + 1),
        ], fn ($p) => $p !== false);
        $body = substr($source, $start, ($ends ? min($ends) : strlen($source)) - $start);

        $this->assertStringContainsString($call, $body, "{$file} {$method}: the Stripe call under the lock must go through StripeService::underLock()");
    }
}
