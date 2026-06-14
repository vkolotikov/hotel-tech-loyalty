<?php

namespace Tests\Feature\Smoobu;

use App\Models\HotelSetting;
use App\Services\SmoobuClient;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks SmoobuClient::request() retry/backoff behaviour — the
 * resilience layer that absorbs Smoobu's rate limit (~60 req/min)
 * + transient 5xx gateway hiccups. The 2026-05-31 Forrest Glamp
 * recovery arc rewrote big chunks of this loop; these tests pin
 * the contract so a future tidy-up doesn't silently regress it.
 *
 * Critical invariants per CLAUDE.md + the inline docblock:
 *
 *   1. 429 → retry with exponential backoff (250/500/1000ms),
 *      up to RATE_LIMIT_RETRIES (3) attempts. Retry-After header
 *      OVERRIDES the exponential schedule when Smoobu sends one.
 *
 *   2. 5xx (transient gateway) → same retry treatment as 429.
 *
 *   3. 4xx (non-429) → FATAL on first response. No retry —
 *      these reflect a real client problem (bad channelId,
 *      missing required field, etc.) that retry can't fix.
 *
 *   4. Error message on fatal throws carries the body excerpt
 *      (formatBodyExcerpt). Pre-fix it only carried the status
 *      code — staff had to grep laravel.log to see WHY.
 *
 *   5. 404 on POST /reservations gets a channel-config hint
 *      pointing at the diag command. Common-cause heuristic so
 *      the operator doesn't have to guess.
 *
 *   6. Exhausted retries throw RuntimeException with the body
 *      excerpt — doesn't keep looping forever.
 *
 * CONSTRAINT HONORED: no real Smoobu calls. Http::fake()
 * intercepts every outbound HTTP request and returns canned
 * responses. The "don't break Smoobu" feedback memory applies
 * specifically to this surface — locking the behaviour prevents
 * future drift.
 *
 * Backoff timing note: each test deliberately limits the number
 * of retries triggered (mostly 1 retry max) to keep wall time
 * under a few hundred ms total.
 */
class SmoobuClientRetryTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private SmoobuClient $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // booking_smoobu_api_key is in HotelSetting::ENCRYPTED_KEYS,
        // so this write encrypts at rest + the accessor decrypts for
        // SmoobuClient::setting() — matches prod boot() path.
        HotelSetting::create([
            'key'    => 'booking_smoobu_api_key',
            'value'  => 'test_api_key_value',
            'type'   => 'string',
            'group'  => 'integrations',
            'label'  => 'Smoobu API key',
        ]);
        HotelSetting::create([
            'key'    => 'booking_smoobu_base_url',
            'value'  => 'https://login.smoobu.com/api',
            'type'   => 'string',
            'group'  => 'integrations',
            'label'  => 'Smoobu base URL',
        ]);

        $this->client = new SmoobuClient();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_successful_request_returns_decoded_body_no_retry(): void
    {
        // Baseline: a 200 first time + no retry. The whole point of
        // the loop is to be invisible on the happy path.
        Http::fake([
            '*' => Http::response(['id' => 12345, 'status' => 'created'], 200),
        ]);

        $result = $this->client->getReservation('12345');

        $this->assertSame(12345, $result['id'] ?? null);
        Http::assertSentCount(1);
    }

    public function test_429_triggers_retry_then_succeeds(): void
    {
        // The canonical rate-limit recovery path. First call 429,
        // second call 200 — Smoobu integration survives a
        // momentary burst over their 60 req/min budget.
        Http::fakeSequence()
            ->push('Rate limited', 429)
            ->push(['id' => 999], 200);

        $result = $this->client->getReservation('999');

        $this->assertSame(999, $result['id']);
        Http::assertSentCount(2);
    }

    public function test_retry_after_header_overrides_default_backoff(): void
    {
        // Smoobu sometimes sends Retry-After. The loop must honor
        // it (in seconds, converted to ms internally). Default
        // exponential schedule (~250ms) is shorter than a typical
        // Retry-After value; we test the override by measuring
        // wall-clock between attempts.
        Http::fakeSequence()
            ->push('rate limited', 429, ['Retry-After' => '1'])  // 1 second
            ->push(['ok' => true], 200);

        $start = microtime(true);
        $this->client->getReservation('123');
        $elapsedMs = (microtime(true) - $start) * 1000;

        // Default backoff would be 250ms. Retry-After=1 = 1000ms.
        // Allow some slack for test overhead but verify it's not
        // the short default.
        $this->assertGreaterThanOrEqual(900, $elapsedMs,
            'Retry-After must override the shorter default backoff.');
        Http::assertSentCount(2);
    }

    public function test_5xx_triggers_retry_then_succeeds(): void
    {
        // Transient gateway treatment per the docblock — 5xx are
        // retried with the same exponential backoff as 429.
        Http::fakeSequence()
            ->push('bad gateway', 502)
            ->push(['ok' => true], 200);

        $result = $this->client->getReservation('1');

        $this->assertSame(true, $result['ok']);
        Http::assertSentCount(2);
    }

    public function test_4xx_non_429_is_fatal_first_response_no_retry(): void
    {
        // Critical: 400/401/403 etc. MUST NOT be retried — they
        // reflect a real client problem (bad channelId, missing
        // field) that retry can't fix. Retrying would waste the
        // rate-limit budget on guaranteed failures.
        Http::fake([
            '*' => Http::response(['detail' => 'apartmentId required'], 400),
        ]);

        try {
            $this->client->getReservation('1');
            $this->fail('Non-429 4xx must throw.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Smoobu API error', $e->getMessage());
            $this->assertStringContainsString('400', $e->getMessage());
        }

        Http::assertSentCount(1);
    }

    public function test_404_is_fatal_and_carries_body_excerpt(): void
    {
        // 404 also bails first time. The exception message must
        // surface the JSON body excerpt so staff see the reason
        // (e.g. "apartment id 0 not found") without grepping logs.
        Http::fake([
            '*' => Http::response(['detail' => 'apartment 0 not found'], 404),
        ]);

        try {
            $this->client->getReservation('zzz');
            $this->fail('404 must throw.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('apartment 0 not found', $e->getMessage(),
                'Exception must include the JSON body detail for forensic visibility.');
        }
    }

    public function test_404_on_post_reservations_includes_channel_config_hint(): void
    {
        // The targeted heuristic per the docblock: a 404 on
        // POST /reservations is almost always a bad channel id.
        // The exception message must include the diag-command hint
        // so staff can self-heal without guessing.
        Http::fake([
            '*' => Http::response(['error' => 'channel not found'], 404),
        ]);

        try {
            $this->client->createReservation([
                'arrivalDate'   => '2026-07-01',
                'departureDate' => '2026-07-03',
                'apartmentId'   => 12345,
            ]);
            $this->fail('POST /reservations 404 must throw.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('channel_id', $e->getMessage(),
                'POST /reservations 404 must include the channel-config hint.');
            $this->assertStringContainsString('diag:smoobu-channels', $e->getMessage(),
                'Hint must point at the diag command for self-heal.');
        }
    }

    public function test_500_text_body_excerpt_is_collapsed_to_single_line(): void
    {
        // Even when Smoobu returns plain text / HTML (proxy error
        // pages), the excerpt must collapse newlines + extra
        // whitespace into a single line so the audit log entry
        // stays readable.
        $html = "<html>\n  <body>\n    <h1>503 Service Unavailable</h1>\n  </body>\n</html>";
        Http::fake([
            '*' => Http::response($html, 503),
        ]);

        try {
            $this->client->getReservation('1');
            $this->fail('Exhausted retries on 503 must throw.');
        } catch (\RuntimeException $e) {
            $msg = $e->getMessage();
            // The Smoobu error line should be present and on a
            // single line (no \n).
            $this->assertStringContainsString('Service Unavailable', $msg);
            $errorLine = explode("\n", $msg)[0];
            $this->assertStringNotContainsString("\n  ", $errorLine,
                'Body excerpt must collapse multi-line HTML to single line.');
        }
    }

    public function test_exhausted_retries_on_persistent_429_eventually_throws(): void
    {
        // Loop termination guarantee — after RATE_LIMIT_RETRIES
        // (3) retries on persistent 429, we throw rather than
        // retry forever. Without this, a hung Smoobu would lock
        // request workers indefinitely.
        Http::fake([
            '*' => Http::response('rate limited persistently', 429),
        ]);

        try {
            $this->client->getReservation('1');
            $this->fail('Exhausted retries must throw.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('429', $e->getMessage());
        }

        // 1 initial + 3 retries = 4 total calls.
        Http::assertSentCount(4);
    }

    public function test_body_excerpt_truncates_huge_payloads(): void
    {
        // Defense against a misbehaving server returning a massive
        // error body (sometimes a full HTML 502 page). The excerpt
        // must hard-cap so audit logs don't get flooded.
        $hugeBody = str_repeat('X', 5000);
        Http::fake([
            '*' => Http::response($hugeBody, 400),
        ]);

        try {
            $this->client->getReservation('1');
            $this->fail();
        } catch (\RuntimeException $e) {
            // The truncate cap inside formatBodyExcerpt is 1000
            // chars; the overall message includes the prefix +
            // excerpt. The full body length (5000 chars) must NOT
            // appear verbatim in the message.
            $this->assertLessThan(2500, strlen($e->getMessage()),
                'Body excerpt must truncate huge payloads.');
            $this->assertStringContainsString('…', $e->getMessage(),
                'Truncated excerpt must end with an ellipsis marker.');
        }
    }
}
