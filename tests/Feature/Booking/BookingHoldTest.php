<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the BookingHold model contract — the cart-state carrier
 * BookingEngineService::confirm() reads on every booking confirm.
 *
 * Why this matters:
 *
 *   A BookingHold is created by quote() (the price quote step
 *   that shows the guest the total + room + extras). The hold
 *   has a 10-min TTL — long enough for the guest to type their
 *   details + submit Stripe Elements, short enough that a
 *   reasonable retry window stays meaningful.
 *
 *   confirm() reads the hold by hold_token, validates isActive,
 *   then carries the payload_json (room ids, guest details,
 *   extras) into the Smoobu createReservation + BookingMirror
 *   write. A stale/inactive hold yields a 'no longer available'
 *   error so the guest's payment auth gets cancelled.
 *
 *   The PII concern: payload_json carries guest name/email/phone
 *   indefinitely until the prune cron (bookings:prune-holds)
 *   sweeps it (GDPR-aware retention — see PruneBookingHolds
 *   tests).
 *
 * Contract:
 *
 *   - isActive() = status='active' AND expires_at > now
 *     - any other status (expired/confirmed/abandoned) → false
 *     - past expires_at → false even when status='active'
 *
 *   - scopeActive query helper composes the same predicate
 *
 *   - payload_json round-trips through array cast (rooms +
 *     guest + extras + totals)
 *
 *   - expires_at cast to Carbon (datetime)
 *
 *   - BelongsToOrganization auto-fill from bound context
 *
 *   - Unique on (organization_id, hold_token) — duplicate token
 *     in same org throws UniqueConstraintViolationException
 *
 *   - TenantScope isolates cross-org reads
 */
class BookingHoldTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // booking_holds + booking_idempotency_keys live in this bundle.
        $this->setUpBookingConfirmSchema();

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /* ─── isActive() — the load-bearing freshness gate ─── */

    public function test_isActive_true_when_status_active_and_expires_in_future(): void
    {
        // CRITICAL: confirm() relies on isActive() to gate the
        // entire booking finalization. Pre-fix a regression that
        // weakened this check would let stale holds confirm,
        // double-booking inventory.
        $hold = BookingHold::create([
            'hold_token' => 'token_active_001',
            'status'     => 'active',
            'expires_at' => now()->addMinutes(10),
            'payload_json' => ['guest' => ['email' => 'g@example.com']],
        ]);

        $this->assertTrue($hold->isActive(),
            'status=active + future expires_at MUST be active.');
    }

    public function test_isActive_false_when_status_active_but_expires_in_past(): void
    {
        // The TTL guard. A 10-min hold that wasn't confirmed in
        // time MUST be treated as dead — confirm() rejects with
        // 'no longer available' so the customer's Stripe auth gets
        // cancelled instead of held.
        $hold = BookingHold::create([
            'hold_token' => 'token_expired_002',
            'status'     => 'active',
            'expires_at' => now()->subMinute(), // past
        ]);

        $this->assertFalse($hold->isActive(),
            'Past expires_at MUST yield isActive=false even when status=active.');
    }

    public function test_isActive_false_when_status_not_active(): void
    {
        // Terminal/in-progress statuses MUST short-circuit isActive
        // regardless of expires_at. 'confirmed' = already booked,
        // re-confirming would double-write; 'expired'/'abandoned'
        // = explicit dead-state.
        foreach (['confirmed', 'expired', 'abandoned'] as $status) {
            $hold = BookingHold::create([
                'hold_token' => "token_{$status}_003",
                'status'     => $status,
                'expires_at' => now()->addMinutes(10), // future
            ]);

            $this->assertFalse($hold->isActive(),
                "status={$status} MUST yield isActive=false regardless of expires_at.");

            $hold->delete(); // cleanup for next iteration
        }
    }

    /* ─── scopeActive composes the same predicate ─── */

    public function test_scopeActive_returns_only_active_and_unexpired_holds(): void
    {
        BookingHold::create([
            'hold_token' => 'token_scope_keep',
            'status'     => 'active',
            'expires_at' => now()->addMinutes(5),
        ]);

        // 3 rows that scopeActive MUST exclude:
        BookingHold::create([
            'hold_token' => 'token_scope_expired',
            'status'     => 'active',
            'expires_at' => now()->subMinute(),
        ]);
        BookingHold::create([
            'hold_token' => 'token_scope_confirmed',
            'status'     => 'confirmed',
            'expires_at' => now()->addMinutes(5),
        ]);
        BookingHold::create([
            'hold_token' => 'token_scope_abandoned',
            'status'     => 'abandoned',
            'expires_at' => now()->addMinutes(5),
        ]);

        $activeRows = BookingHold::active()->get();

        $this->assertCount(1, $activeRows,
            'scopeActive MUST exclude expired + non-active rows.');
        $this->assertSame('token_scope_keep', $activeRows->first()->hold_token);
    }

    /* ─── payload_json array cast ─── */

    public function test_payload_json_round_trips_as_array(): void
    {
        // confirm() reads payload_json as an array, expecting the
        // documented shape (rooms, guest, extras, totals). The
        // cast preserves nested arrays — keys are not silently
        // stringified, lists keep order.
        $payload = [
            'guest' => [
                'name'  => 'Alice Smith',
                'email' => 'alice@example.com',
                'phone' => '+1 555-1234',
            ],
            'unit_id'   => 12345,
            'check_in'  => '2026-07-01',
            'check_out' => '2026-07-04',
            // Use values with non-zero decimals so JSON encode/decode
            // doesn't strip them to int (.00 collapses to int — real
            // confirm() callers should treat numeric fields cautiously).
            'extras'    => [
                ['id' => 'breakfast', 'qty' => 2, 'price' => 30.50],
                ['id' => 'parking',   'qty' => 1, 'price' => 15.25],
            ],
            'room_total' => 450.75,
            'gross_total'=> 525.50,
        ];

        BookingHold::create([
            'hold_token'   => 'token_payload_roundtrip',
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => $payload,
        ]);

        $hold = BookingHold::where('hold_token', 'token_payload_roundtrip')->first();
        $this->assertSame($payload, $hold->payload_json,
            'payload_json MUST round-trip exactly (rooms + guest + extras + totals all intact).');
    }

    public function test_null_payload_json_persists_as_null(): void
    {
        // Defensive: a hold without payload (legacy / probe rows)
        // MUST persist as null rather than empty array.
        BookingHold::create([
            'hold_token'   => 'token_null_payload',
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => null,
        ]);

        $hold = BookingHold::where('hold_token', 'token_null_payload')->first();
        $this->assertNull($hold->payload_json);
    }

    /* ─── expires_at datetime cast ─── */

    public function test_expires_at_casts_to_carbon(): void
    {
        // confirm() calls $hold->expires_at->isFuture() — needs
        // Carbon, not a raw string. Lock the cast.
        $hold = BookingHold::create([
            'hold_token' => 'token_cast_test',
            'status'     => 'active',
            'expires_at' => now()->addMinutes(10),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $hold->expires_at);
    }

    /* ─── BelongsToOrganization auto-fill ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        // quote() doesn't pass org_id explicitly — relies on the
        // trait's auto-fill from bound tenant context. Lock the
        // contract.
        $hold = BookingHold::create([
            'hold_token' => 'token_autofill',
            'status'     => 'active',
            'expires_at' => now()->addMinutes(10),
        ]);

        $this->assertSame($this->orgId, (int) $hold->organization_id);
    }

    /* ─── Unique on (org, hold_token) ─── */

    public function test_duplicate_hold_token_in_same_org_throws_unique_violation(): void
    {
        // CRITICAL: hold_token must be unique within an org so
        // confirm()'s by-token lookup is deterministic. Two holds
        // with the same token would let a stale row hijack a new
        // confirm.
        BookingHold::create([
            'hold_token' => 'token_unique_dup',
            'status'     => 'active',
            'expires_at' => now()->addMinutes(10),
        ]);

        $this->expectException(UniqueConstraintViolationException::class);

        BookingHold::create([
            'hold_token' => 'token_unique_dup',
            'status'     => 'active',
            'expires_at' => now()->addMinutes(10),
        ]);
    }

    public function test_same_hold_token_across_different_orgs_coexists(): void
    {
        // Per-tenant unique key — client-generated tokens MAY
        // collide across orgs without breaking either.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('booking_holds')->insert([
            'organization_id' => $orgA,
            'hold_token'      => 'shared_token_xx',
            'status'          => 'active',
            'expires_at'      => now()->addMinutes(10),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('booking_holds')->insert([
            'organization_id' => $orgB,
            'hold_token'      => 'shared_token_xx',
            'status'          => 'active',
            'expires_at'      => now()->addMinutes(10),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $count = BookingHold::withoutGlobalScopes()
            ->where('hold_token', 'shared_token_xx')
            ->count();
        $this->assertSame(2, $count,
            'Per-tenant unique on (org, hold_token) MUST allow same token across orgs.');
    }

    /* ─── TenantScope cross-org isolation ─── */

    public function test_tenant_scope_isolates_org_a_from_org_b_reads(): void
    {
        // Even if a malicious customer knew another tenant's
        // hold_token (e.g. via URL leak), the TenantScope guard
        // MUST prevent them from seeing or confirming it.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('booking_holds')->insert([
            'organization_id' => $orgA,
            'hold_token'      => 'token_org_a_secret',
            'status'          => 'active',
            'expires_at'      => now()->addMinutes(10),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // Switch to org B context.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);

        $found = BookingHold::where('hold_token', 'token_org_a_secret')->first();
        $this->assertNull($found,
            'TenantScope MUST prevent org B from seeing org A\'s hold token.');
    }
}
