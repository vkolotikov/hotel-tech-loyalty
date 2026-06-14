<?php

namespace Tests\Feature\Stripe;

use App\Models\StripeWebhookEvent;
use Database\Factories\OrganizationFactory;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the StripeWebhookEvent dedup contract (June 1 2026 audit).
 *
 * Per docs.stripe.com/webhooks: Stripe MAY resend the same Event
 * object during a network blip. Without per-event dedup, every
 * resend re-fires the side effects: a `charge.refunded` event
 * could trigger two refund-processing passes (one of them stamping
 * over a more authoritative state), `payment_intent.succeeded`
 * could double-process the orphan-recovery path.
 *
 * The pattern (mirrors SmoobuWebhookEvent):
 *
 *   - Insert one row per (organization_id, event_id). Unique index
 *     on that pair means the SECOND insert from a network-blip
 *     resend throws Illuminate\Database\UniqueConstraintViolationException.
 *
 *   - The webhook handler catches it and returns
 *     `{received:true, duplicate:true}` so Stripe stops retrying.
 *
 *   - Per-action gates (last_refund_id, mirror status guards) stay
 *     as defense-in-depth — this table closes the worst-case
 *     window where retries arrive >60s apart and slip past the
 *     RefundAttempt freshness check.
 *
 * Unique key is `(organization_id, event_id)` NOT just `event_id`
 * — Stripe doesn't reuse event ids across accounts in practice, but
 * the per-tenant key is safer and matches the SmoobuWebhookEvent
 * pattern.
 */
class StripeWebhookEventDedupTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('stripe_webhook_events')) {
            Schema::create('stripe_webhook_events', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('event_id', 80);
                $t->string('event_type', 80);
                $t->string('payment_intent_id', 80)->nullable();
                $t->string('charge_id', 80)->nullable();
                $t->timestamp('received_at')->useCurrent();
                $t->timestamps();
                $t->unique(['organization_id', 'event_id'], 'stripe_webhook_events_dedup_unique');
                $t->index(['organization_id', 'event_type', 'received_at']);
                $t->index('payment_intent_id');
            });
        }
    }

    /* ─── Insert + duplicate throws — the CORE contract ─── */

    public function test_duplicate_event_id_in_same_org_throws_unique_violation(): void
    {
        // CRITICAL: this is the contract the controller depends on.
        // BookingPublicController::stripeWebhook() catches
        // UniqueConstraintViolationException to ack + skip dup
        // deliveries. If this stops throwing, every dup event re-
        // fires the side effects (double refund, double email,
        // double points reversal).
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        StripeWebhookEvent::create([
            'event_id'   => 'evt_test_dup_001',
            'event_type' => 'charge.refunded',
            'received_at' => now(),
        ]);

        $this->expectException(UniqueConstraintViolationException::class);

        // Second insert with same (org, event_id) MUST throw 23505.
        StripeWebhookEvent::create([
            'event_id'   => 'evt_test_dup_001',
            'event_type' => 'charge.refunded',
            'received_at' => now(),
        ]);
    }

    public function test_different_event_ids_in_same_org_coexist(): void
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        StripeWebhookEvent::create([
            'event_id'   => 'evt_test_event_1',
            'event_type' => 'payment_intent.succeeded',
            'received_at' => now(),
        ]);
        StripeWebhookEvent::create([
            'event_id'   => 'evt_test_event_2',
            'event_type' => 'payment_intent.succeeded',
            'received_at' => now(),
        ]);

        $count = StripeWebhookEvent::withoutGlobalScopes()
            ->where('organization_id', $org->id)
            ->count();
        $this->assertSame(2, $count,
            'Different event_ids in same org MUST coexist.');
    }

    public function test_same_event_id_in_different_orgs_coexists(): void
    {
        // Per the migration's docblock: "Stripe doesn't reuse event
        // ids across accounts in practice, but the per-tenant unique
        // is safer." Two orgs each with their own evt_xxx must NOT
        // collide.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        \DB::table('stripe_webhook_events')->insert([
            'organization_id' => $orgA->id,
            'event_id'        => 'evt_same_across_orgs',
            'event_type'      => 'payment_intent.succeeded',
            'received_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('stripe_webhook_events')->insert([
            'organization_id' => $orgB->id,
            'event_id'        => 'evt_same_across_orgs',
            'event_type'      => 'payment_intent.succeeded',
            'received_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $count = StripeWebhookEvent::withoutGlobalScopes()
            ->where('event_id', 'evt_same_across_orgs')
            ->count();
        $this->assertSame(2, $count,
            'Per-tenant unique key MUST allow same event_id across different orgs.');
    }

    /* ─── Tenant-scope binding ─── */

    public function test_org_context_auto_fills_organization_id_on_create(): void
    {
        // The BelongsToOrganization trait auto-fills org_id when
        // bound context exists. Webhook handler relies on this:
        // after resolveStripeWebhookOrg() binds the org, the
        // StripeWebhookEvent::create() call doesn't need to pass
        // organization_id explicitly.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $row = StripeWebhookEvent::create([
            'event_id'   => 'evt_autofill_org',
            'event_type' => 'charge.refunded',
            'received_at' => now(),
        ]);

        $this->assertSame((int) $org->id, (int) $row->organization_id,
            'BelongsToOrganization auto-fills organization_id on create.');
    }

    public function test_tenant_scope_isolates_org_a_from_org_b_reads(): void
    {
        // Even cross-org event_id collisions don't leak — TenantScope
        // applies to reads. Webhook stats endpoints (when added)
        // automatically only see the current tenant's rows.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        \DB::table('stripe_webhook_events')->insert([
            'organization_id' => $orgA->id,
            'event_id'        => 'evt_a',
            'event_type'      => 'charge.refunded',
            'received_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('stripe_webhook_events')->insert([
            'organization_id' => $orgB->id,
            'event_id'        => 'evt_b',
            'event_type'      => 'charge.refunded',
            'received_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        app()->instance('current_organization_id', $orgA->id);
        $aOnly = StripeWebhookEvent::all();
        $this->assertCount(1, $aOnly);
        $this->assertSame('evt_a', $aOnly->first()->event_id);
    }

    /* ─── Required fields + casts ─── */

    public function test_received_at_is_castable_to_carbon(): void
    {
        // The 'datetime' cast on received_at is what lets webhook
        // analytics chart by hour/day cleanly.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $row = StripeWebhookEvent::create([
            'event_id'   => 'evt_cast_test',
            'event_type' => 'charge.refunded',
            'received_at' => now()->subMinute(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $row->received_at);
    }

    public function test_payment_intent_id_and_charge_id_are_nullable(): void
    {
        // Not every event type carries a PI or charge id (e.g.
        // dispute events carry a charge_id but no PI). Both must
        // be nullable so the same table holds the full event taxonomy.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $row = StripeWebhookEvent::create([
            'event_id'         => 'evt_nullable_test',
            'event_type'       => 'invoice.created',
            'payment_intent_id' => null,
            'charge_id'        => null,
            'received_at'      => now(),
        ]);

        $this->assertNull($row->payment_intent_id);
        $this->assertNull($row->charge_id);
    }

    public function test_event_id_capacity_handles_stripe_id_lengths(): void
    {
        // Stripe event ids are typically 28 chars (`evt_1OdAr2…`).
        // Column is sized 80 chars (reserves room). A 50-char id
        // MUST fit without truncation.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $longId = 'evt_' . str_repeat('A1b2C3', 7) . '78'; // 48 chars
        $row = StripeWebhookEvent::create([
            'event_id'   => $longId,
            'event_type' => 'charge.refunded',
            'received_at' => now(),
        ]);

        $this->assertSame($longId, $row->event_id,
            'Long Stripe event id MUST persist without truncation.');
    }
}
