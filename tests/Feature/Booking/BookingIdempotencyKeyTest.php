<?php

namespace Tests\Feature\Booking;

use App\Models\BookingIdempotencyKey;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks BookingIdempotencyKey — the THIRD layer of the 3-layer
 * idempotency stack on BookingEngineService::confirm().
 *
 * The stack (top to bottom):
 *
 *   1. Pre-lock cache hit  — read existing valid row → return
 *      cached response with `replayed: true`. Fast path for
 *      retries that arrive after a successful confirm.
 *
 *   2. In-lock re-check    — same query under the per-org lock
 *      throws IdempotencyReplay; the catch block rolls the
 *      transaction back and returns the winner's cached
 *      response. Catches the race where two requests both miss
 *      the pre-check.
 *
 *   3. 23505 backstop      — BookingIdempotencyKey::create() at
 *      the end of confirm() throws UniqueConstraintViolationException
 *      if a concurrent request beat us by milliseconds. The
 *      outer catch returns the winner's response.
 *
 * Without layer 3, a same-key + different-rooms client bug could
 * write TWO mirrors for one idempotency_key — the worst case is
 * a second Stripe charge on a "same retry" attempt.
 *
 * Contract this file locks:
 *
 *   - Unique on (organization_id, idempotency_key) — duplicate
 *     insert throws (the 23505 backstop)
 *
 *   - isValid() returns true when expires_at > now, false when
 *     past — the cache-hit at layer 1 must NOT replay stale rows
 *
 *   - response_json is array-cast — confirm() reads/writes the
 *     cached response as PHP array
 *
 *   - BelongsToOrganization auto-fills org_id from bound context
 *
 *   - TenantScope isolates cross-org reads
 *
 *   - Different idempotency_keys in same org coexist
 *
 *   - Same idempotency_key across DIFFERENT orgs coexists
 *     (per-tenant unique key by design)
 */
class BookingIdempotencyKeyTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        // booking_idempotency_keys + booking_holds + booking_mirror
        // schemas all live here.
        $this->setUpBookingConfirmSchema();
    }

    /* ─── Layer 3: 23505 backstop ─── */

    public function test_duplicate_idempotency_key_in_same_org_throws_unique_violation(): void
    {
        // CRITICAL: this is what BookingEngineService::confirm()'s
        // outer catch depends on. If the unique constraint stops
        // throwing, a same-key concurrent confirm could write TWO
        // mirrors for one logical booking — second Stripe charge
        // territory.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_confirm_001',
            'expires_at'      => now()->addHours(24),
            'response_json'   => ['mirror_id' => 42],
        ]);

        $this->expectException(UniqueConstraintViolationException::class);
        BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_confirm_001', // same key
            'expires_at'      => now()->addHours(24),
            'response_json'   => ['mirror_id' => 99], // different result
        ]);
    }

    /* ─── isValid() — gate layer 1 cache hits ─── */

    public function test_isValid_returns_true_when_expires_at_in_future(): void
    {
        // Layer 1 cache hit reads `$existing->isValid()` before
        // replaying. Future expiration → cache HIT (return cached
        // response).
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $row = BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_valid_future',
            'expires_at'      => now()->addHour(),
        ]);

        $this->assertTrue($row->isValid(),
            'Future expires_at → isValid() true → cache replay engages.');
    }

    public function test_isValid_returns_false_when_expires_at_in_past(): void
    {
        // Past expiration → cache MISS → confirm() proceeds with a
        // fresh execution. Without this gate, stale rows would
        // replay 24h+-old responses against today's request.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $row = BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_expired',
            'expires_at'      => now()->subMinute(),
        ]);

        $this->assertFalse($row->isValid(),
            'Past expires_at → isValid() false → cache MISS → fresh confirm runs.');
    }

    /* ─── response_json — array cast (cached response shape) ─── */

    public function test_response_json_round_trips_as_array(): void
    {
        // confirm() writes the response as an array; the cache hit
        // reads it back via $existing->response_json which MUST
        // come back as the same shape. JSON casts on the model
        // handle the (de)serialization.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $original = [
            'mirror_id'        => 42,
            'reservation_id'   => 'SM-12345',
            'price_total'      => 250.50,
            'guest_email'      => 'g@example.com',
            'nested'           => ['key' => 'value', 'list' => [1, 2, 3]],
        ];

        BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_response_shape',
            'expires_at'      => now()->addHour(),
            'response_json'   => $original,
        ]);

        $row = BookingIdempotencyKey::where('idempotency_key', 'idemp_response_shape')->first();
        $this->assertSame($original, $row->response_json,
            'Cached response MUST round-trip through array cast (Stripe metadata, mirror_id, etc.).');
    }

    /* ─── BelongsToOrganization integration ─── */

    public function test_bound_org_context_auto_fills_organization_id_on_create(): void
    {
        // The confirm() flow binds org context via TenantMiddleware
        // before this row writes. Auto-fill keeps the call site
        // clean (no manual org_id pass).
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $row = BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_autofill',
            'expires_at'      => now()->addHour(),
        ]);

        $this->assertSame((int) $org->id, (int) $row->organization_id);
    }

    public function test_tenant_scope_isolates_org_a_from_org_b_reads(): void
    {
        // Org A's idempotency key MUST NOT surface in org B's scoped
        // queries. Without this isolation, a malicious customer could
        // probe other tenants' confirm() results — leaks pricing +
        // guest emails.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        \DB::table('booking_idempotency_keys')->insert([
            'organization_id' => $orgA->id,
            'idempotency_key' => 'idemp_a',
            'expires_at'      => now()->addHour(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('booking_idempotency_keys')->insert([
            'organization_id' => $orgB->id,
            'idempotency_key' => 'idemp_b',
            'expires_at'      => now()->addHour(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        app()->instance('current_organization_id', $orgA->id);
        $rowsForA = BookingIdempotencyKey::all();
        $this->assertCount(1, $rowsForA);
        $this->assertSame('idemp_a', $rowsForA->first()->idempotency_key);
    }

    /* ─── Coexistence patterns ─── */

    public function test_different_idempotency_keys_in_same_org_coexist(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_one',
            'expires_at'      => now()->addHour(),
        ]);
        BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_two',
            'expires_at'      => now()->addHour(),
        ]);

        $count = BookingIdempotencyKey::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->count();
        $this->assertSame(2, $count,
            'Distinct idempotency_keys in same org coexist — they represent independent confirm calls.');
    }

    public function test_same_idempotency_key_across_orgs_coexists(): void
    {
        // The unique key is (organization_id, idempotency_key), not
        // just idempotency_key. Two orgs each with their own retry
        // attempt using the same client-generated key MUST NOT
        // collide cross-tenant.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        \DB::table('booking_idempotency_keys')->insert([
            'organization_id' => $orgA->id,
            'idempotency_key' => 'idemp_shared_str',
            'expires_at'      => now()->addHour(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('booking_idempotency_keys')->insert([
            'organization_id' => $orgB->id,
            'idempotency_key' => 'idemp_shared_str',
            'expires_at'      => now()->addHour(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $count = BookingIdempotencyKey::withoutGlobalScopes()
            ->where('idempotency_key', 'idemp_shared_str')
            ->count();
        $this->assertSame(2, $count,
            'Per-tenant unique key allows same client idempotency_key across orgs.');
    }

    /* ─── Edge case: long keys ─── */

    public function test_long_idempotency_key_persists_without_truncation(): void
    {
        // Column is 128 chars — clients can use SHA-256 (64 hex)
        // + prefix or other long-form keys without truncation.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $longKey = str_repeat('a', 120);
        $row = BookingIdempotencyKey::create([
            'idempotency_key' => $longKey,
            'expires_at'      => now()->addHour(),
        ]);

        $row->refresh();
        $this->assertSame($longKey, $row->idempotency_key,
            'Long client-generated keys (up to 128 chars) MUST persist intact.');
    }

    /* ─── Cumulative: full Layer-1 cache-hit replay simulation ─── */

    public function test_cache_hit_replay_simulation_returns_cached_response(): void
    {
        // Simulates Layer 1 of confirm()'s idempotency: look up the
        // key, verify isValid, return response_json. Locks the
        // full happy-path flow at the model level.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // JSON encode/decode collapses 350.00 → 350 (int), so use
        // a value with a meaningful decimal that survives the round
        // trip. Real callers should treat price_total cautiously
        // around int/float coercion — but the cached response
        // mostly carries Stripe ids + booking metadata, not
        // arithmetic that depends on float precision.
        $cachedResponse = [
            'mirror_id'      => 42,
            'reservation_id' => 'SM-A1B2',
            'price_total'    => 350.50,
            'payment_status' => 'paid',
        ];

        BookingIdempotencyKey::create([
            'idempotency_key' => 'idemp_replay_test',
            'expires_at'      => now()->addHours(24),
            'response_json'   => $cachedResponse,
        ]);

        // Simulate retry: same key lookup.
        $existing = BookingIdempotencyKey::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->where('idempotency_key', 'idemp_replay_test')
            ->first();

        $this->assertNotNull($existing);
        $this->assertTrue($existing->isValid(),
            'Pre-check Layer 1 MUST find a valid row.');
        $this->assertSame($cachedResponse, $existing->response_json,
            'Cached response MUST replay exactly.');
    }
}
