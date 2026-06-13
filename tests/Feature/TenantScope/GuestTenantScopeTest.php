<?php

namespace Tests\Feature\TenantScope;

use App\Models\Guest;
use App\Models\Organization;
use App\Scopes\TenantScope;
use Database\Factories\GuestFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Cross-tenant boundary test on the Guest model.
 *
 * Guest is the canonical multi-tenant CRM record — it carries PII (name,
 * email, phone, notes, custom_data) and the audit's first critical
 * finding was about cross-tenant leaks on similarly-shaped models. The
 * BelongsToOrganization trait + TenantScope is the only barrier between
 * org A's queries and org B's PII. This test locks that barrier in:
 *
 *   1. No context bound → 0 rows (fail-closed contract)
 *   2. Context = org A → only org A's rows
 *   3. Context = org B → only org B's rows
 *   4. Cross-tenant find($id) returns null
 *   5. withoutGlobalScope() escape hatch returns everything
 *   6. Auto-fill of organization_id on create (the writer side)
 *
 * Together these cover every documented invariant of the tenant
 * boundary on the Guest model — and by extension every other model
 * that uses BelongsToOrganization (~50+ models share the same trait).
 *
 * Schema is provisioned by SetsUpMinimalSchema (sqlite-safe); see that
 * trait for the rationale of why we don't run all 137 production
 * migrations against the in-memory test DB.
 */
class GuestTenantScopeTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
    }

    protected function tearDown(): void
    {
        // Always unbind the org context after a test so the next one
        // starts fresh. Without this, a test that binds org A but
        // doesn't bind a different org B could leak that binding into
        // the next test's setUp.
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** Helper — raw-insert a guest under a specific org id, bypassing
     *  the tenant guard. Lets tests set up cross-tenant fixtures without
     *  needing to flip the org context for each row. */
    private function rawCreateGuest(int $orgId, array $overrides = []): Guest
    {
        $attrs = array_merge(
            GuestFactory::new()->definition(),
            ['organization_id' => $orgId],
            $overrides,
        );
        $attrs['created_at'] = now();
        $attrs['updated_at'] = now();
        $id = \DB::table('guests')->insertGetId($attrs);
        return Guest::withoutGlobalScope(TenantScope::class)->findOrFail($id);
    }

    public function test_no_org_context_returns_zero_rows(): void
    {
        $org = OrganizationFactory::new()->create();
        $this->rawCreateGuest($org->id);

        // Sanity — the raw row IS in the table.
        $this->assertSame(1, \DB::table('guests')->count());

        // …but Guest::query() without a bound org returns nothing.
        $this->assertCount(0, Guest::all(), 'TenantScope must fail-closed when no org is bound.');
        $this->assertSame(0, Guest::count());
    }

    public function test_only_returns_current_orgs_rows(): void
    {
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        $this->rawCreateGuest($orgA->id, ['email' => 'a1@orgA.test']);
        $this->rawCreateGuest($orgA->id, ['email' => 'a2@orgA.test']);
        $this->rawCreateGuest($orgB->id, ['email' => 'b1@orgB.test']);
        $this->rawCreateGuest($orgB->id, ['email' => 'b2@orgB.test']);
        $this->rawCreateGuest($orgB->id, ['email' => 'b3@orgB.test']);

        // Bind org A.
        app()->instance('current_organization_id', $orgA->id);
        $emailsA = Guest::pluck('email')->all();
        sort($emailsA);
        $this->assertSame(['a1@orgA.test', 'a2@orgA.test'], $emailsA);
        $this->assertSame(2, Guest::count());

        // Switch to org B.
        app()->instance('current_organization_id', $orgB->id);
        $emailsB = Guest::pluck('email')->all();
        sort($emailsB);
        $this->assertSame(['b1@orgB.test', 'b2@orgB.test', 'b3@orgB.test'], $emailsB);
        $this->assertSame(3, Guest::count());
    }

    public function test_cross_tenant_find_returns_null(): void
    {
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();
        $guestInB = $this->rawCreateGuest($orgB->id);

        // Bind to org A; finding org B's guest by id must NOT resolve.
        app()->instance('current_organization_id', $orgA->id);
        $this->assertNull(
            Guest::find($guestInB->id),
            'Find() under org A must not resolve a guest belonging to org B.',
        );

        // Same with the variadic ids form — must return an empty collection.
        $this->assertCount(0, Guest::find([$guestInB->id]));
    }

    public function test_without_global_scope_is_the_documented_escape_hatch(): void
    {
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();
        $this->rawCreateGuest($orgA->id);
        $this->rawCreateGuest($orgB->id);
        $this->rawCreateGuest($orgB->id);

        // No context — global scope fails closed.
        $this->assertCount(0, Guest::all());

        // Drop the scope explicitly — every row resolves. This is the
        // documented escape hatch for console commands + cross-tenant
        // diag tools. The test exists so a future "fix" to TenantScope
        // can't silently make withoutGlobalScope() return the wrong rows.
        $allRows = Guest::withoutGlobalScope(TenantScope::class)->get();
        $this->assertCount(3, $allRows);
    }

    public function test_create_auto_fills_organization_id_from_context(): void
    {
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        // Bind context to org A; new guests should land under org A.
        app()->instance('current_organization_id', $orgA->id);
        $g1 = Guest::create([
            'first_name' => 'Alice',
            'last_name'  => 'In-A',
            'email'      => 'alice@orgA.test',
        ]);
        $this->assertSame($orgA->id, $g1->organization_id);

        // Switch context; subsequent guests land under org B.
        app()->instance('current_organization_id', $orgB->id);
        $g2 = Guest::create([
            'first_name' => 'Bob',
            'last_name'  => 'In-B',
            'email'      => 'bob@orgB.test',
        ]);
        $this->assertSame($orgB->id, $g2->organization_id);

        // Critical writer-side guard: even when a malicious caller
        // includes organization_id in the payload claiming org A,
        // the trait must overwrite it with the bound context. Tests
        // the "prevents request data from overriding the org" comment
        // in BelongsToOrganization::bootBelongsToOrganization.
        app()->instance('current_organization_id', $orgA->id);
        $g3 = Guest::create([
            'first_name'      => 'Mallory',
            'last_name'       => 'Tampered',
            'email'           => 'mallory@example.test',
            'organization_id' => $orgB->id,  // attacker-supplied wrong org
        ]);
        $this->assertSame(
            $orgA->id,
            $g3->organization_id,
            'organization_id supplied in the payload must NOT override the bound context.',
        );
    }

    public function test_update_cannot_move_record_to_a_different_org(): void
    {
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();
        $guest = $this->rawCreateGuest($orgA->id);

        // Bound to org A — load + try to move to org B via mass-assign.
        app()->instance('current_organization_id', $orgA->id);
        $loaded = Guest::find($guest->id);
        $this->assertNotNull($loaded);

        $loaded->update([
            'organization_id' => $orgB->id,
            'first_name'      => 'Renamed',
        ]);

        $reloaded = Guest::withoutGlobalScope(TenantScope::class)->find($guest->id);
        $this->assertSame($orgA->id, $reloaded->organization_id, 'organization_id must not be mutable post-create.');
        $this->assertSame('Renamed', $reloaded->first_name, '…but other fields should update normally.');
    }
}
