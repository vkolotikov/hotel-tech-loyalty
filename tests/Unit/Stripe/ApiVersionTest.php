<?php

namespace Tests\Unit\Stripe;

use App\Services\StripeService;
use PHPUnit\Framework\TestCase;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Stripe\Util\ApiVersion;

/**
 * Step 4g of the stack plan (2 Nov 2026): stripe-php 22 with the Stripe API version named in code. Every client comes
 * from StripeService::makeClient(), every request carries StripeService::API_VERSION, and a `Stripe-Notice` header on a
 * response (newer stripe-php raises it as a PHP warning, which Laravel turns into an exception) never turns a call
 * Stripe answered into a failure.
 */
class ApiVersionTest extends TestCase
{
    private ?object $before = null;
    /** @var array<string, string|false> */
    private array $env = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->before = ApiRequestor::httpClient();
        foreach (array_merge(['STRIPE_SUPPRESS_NOTICES'], array_column(ApiRequestor::AI_AGENTS, 0)) as $name) {
            $this->env[$name] = getenv($name);
        }
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient($this->before);
        foreach ($this->env as $name => $value) {
            putenv($value === false ? $name : "{$name}={$value}");
        }
        parent::tearDown();
    }

    /** Answers every request with $body and $headers, and keeps what was sent. */
    private function recorder(array $body, array $headers = []): object
    {
        $client = new class($body, $headers) implements ClientInterface {
            public array $requests = [];
            public function __construct(private array $body, private array $headers) {}
            public function request($method, $absUrl, $headers, $params, $hasFile, $apiMode = 'v1', $maxNetworkRetries = null)
            {
                $this->requests[] = compact('method', 'absUrl', 'headers', 'params');
                return [json_encode($this->body), 200, $this->headers];
            }
        };
        ApiRequestor::setHttpClient($client);

        return $client;
    }

    public function test_the_api_version_is_named_and_matches_the_library_it_was_checked_against(): void
    {
        $this->assertSame('2026-10-28.endive', StripeService::API_VERSION);
        $this->assertSame(StripeService::API_VERSION, StripeService::makeClient('sk_test_x')->getStripeVersion());
        // A library upgrade that moves its own version shows here: read Stripe's changelog, then move the pin on purpose.
        $this->assertSame(StripeService::API_VERSION, ApiVersion::CURRENT);
    }

    public function test_every_request_carries_the_pinned_version(): void
    {
        $http = $this->recorder(['id' => 'pi_x', 'object' => 'payment_intent', 'status' => 'requires_capture']);
        StripeService::makeClient('sk_test_x')->paymentIntents->retrieve('pi_x');

        $this->assertCount(1, $http->requests);
        $this->assertContains('Stripe-Version: ' . StripeService::API_VERSION, $http->requests[0]['headers']);
    }

    public function test_a_stripe_notice_never_turns_an_answer_into_an_error(): void
    {
        foreach (array_column(ApiRequestor::AI_AGENTS, 0) as $name) {
            putenv($name); // as on a server: no agent shell
        }
        putenv('STRIPE_SUPPRESS_NOTICES');
        $this->recorder(['id' => 'pi_x', 'object' => 'payment_intent', 'status' => 'succeeded'],
            ['stripe-notice' => 'This is a test-mode notice.']);

        set_error_handler(function (int $level, string $message): bool {
            throw new \ErrorException($message, 0, $level); // what Laravel's handler does with a warning
        });
        try {
            $intent = StripeService::makeClient('sk_test_x')->paymentIntents->retrieve('pi_x');
        } finally {
            restore_error_handler();
        }

        $this->assertSame('succeeded', $intent->status);
        $this->assertSame('true', getenv('STRIPE_SUPPRESS_NOTICES'));
    }

    public function test_an_explicit_notice_setting_is_left_as_it_is(): void
    {
        putenv('STRIPE_SUPPRESS_NOTICES=false');
        StripeService::makeClient('sk_test_x');
        $this->assertSame('false', getenv('STRIPE_SUPPRESS_NOTICES'));
    }

    public function test_no_stripe_client_is_made_anywhere_else(): void
    {
        $root = dirname(__DIR__, 3) . '/app';
        $offenders = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }
            $path = str_replace('\\', '/', $file->getPathname());
            $source = file_get_contents($path);
            if (preg_match('/new\s+\\\\?(Stripe\\\\)?StripeClient\s*\(/', $source)
                && !str_ends_with($path, 'app/Services/StripeService.php')) {
                $offenders[] = substr($path, strlen($root) - 3);
            }
        }
        $this->assertSame([], $offenders, 'Make Stripe clients only through StripeService::makeClient().');
    }
}
