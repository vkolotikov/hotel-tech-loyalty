<?php

namespace Tests\Feature\Realtime;

use App\Models\RealtimeEvent;
use App\Services\RealtimeEventService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks RealtimeEventService — the queue that drives the
 * Engagement Hub's hot-lead toast notifications (CLAUDE.md
 * Engagement Hub section). Three lead-capture sites dispatch
 * 'hot_lead' events here:
 *   - Admin manual lead capture (ChatInboxController::captureLead)
 *   - Widget form submission (WidgetChatController::captureLead)
 *   - AI auto-extraction (WidgetChatController::autoCaptureLeadFromMessage)
 *
 * The events table is polled by every open admin tab via
 * useRealtimeEvents — a regression that drops a payload field
 * leaves agents staring at a black toast.
 *
 * Contracts:
 *
 *   dispatch():
 *     - Creates a RealtimeEvent row with type / title / body /
 *       data fields persisted
 *     - data passed as empty array → stored as null (avoids
 *       empty-object noise in the JSON payload SSE clients read)
 *     - data with values → stored as the array verbatim (cast
 *       handles JSON encode/decode)
 *     - Explicit $orgId param overrides BelongsToOrganization
 *       auto-fill — for console/queue callers that don't bind
 *       current_organization_id
 *     - When no $orgId param + bound context → auto-fills
 *       organization_id via the trait
 *     - created_at stamped to now()
 *
 *   since():
 *     - Returns events with id > the given last-seen id
 *     - Results ordered by id ascending (poll-cursor pattern)
 *     - Capped at 50 results per call (back-pressure guard)
 *
 *   cleanup():
 *     - Deletes events older than N minutes from created_at
 *     - Returns count of deleted rows
 */
class RealtimeEventServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private RealtimeEventService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRealtimeEventsSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->service = new RealtimeEventService();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_dispatch_creates_event_with_type_title_body_data(): void
    {
        // The canonical happy path — the contract every SSE
        // client depends on.
        $event = $this->service->dispatch(
            type:  'hot_lead',
            title: 'Hot lead captured',
            body:  'Jane Doe just submitted a form',
            data:  ['visitor_id' => 12345, 'lead_form_id' => 7],
        );

        $this->assertInstanceOf(RealtimeEvent::class, $event);
        $this->assertSame('hot_lead', $event->type);
        $this->assertSame('Hot lead captured', $event->title);
        $this->assertSame('Jane Doe just submitted a form', $event->body);
        $this->assertSame(['visitor_id' => 12345, 'lead_form_id' => 7], $event->data);
        $this->assertNotNull($event->created_at);
    }

    public function test_dispatch_with_empty_data_array_stores_null(): void
    {
        // The empty-array → null normalization avoids empty-object
        // noise in the SSE payload. Hot-lead events frequently
        // have no extra data beyond title — without this they'd
        // emit `"data": {}` which the frontend has to handle.
        $event = $this->service->dispatch(
            type:  'system',
            title: 'A simple notice',
            body:  null,
            data:  [],
        );

        $this->assertNull($event->data,
            'Empty data array must persist as null.');
    }

    public function test_dispatch_body_null_is_persisted_as_null(): void
    {
        // Body is optional — short-form notifications don't need
        // body text.
        $event = $this->service->dispatch(
            type:  'system',
            title: 'Title only',
        );

        $this->assertNull($event->body);
    }

    public function test_explicit_orgId_param_is_honored_when_no_context_is_bound(): void
    {
        // The cross-tenant dispatch path for console commands +
        // queue workers + webhook handlers that don't bind a
        // tenant context — the docstring on dispatch:
        // "only needed when calling from a context that doesn't
        // bind current_organization_id".
        //
        // BelongsToOrganization's creating hook explicitly FORCES
        // organization_id from bound context (documented tenant
        // safety — request data cannot override the org). So
        // explicit $orgId only takes effect when current_organization_id
        // is unbound.
        $explicit = OrganizationFactory::new()->create();
        app()->forgetInstance('current_organization_id');

        $event = $this->service->dispatch(
            type:  'hot_lead',
            title: 'Console-dispatch',
            body:  null,
            data:  [],
            orgId: $explicit->id,
        );

        $this->assertSame((int) $explicit->id, (int) $event->organization_id,
            'Explicit orgId must persist when no bound context exists.');
    }

    public function test_bound_context_always_wins_over_explicit_orgId(): void
    {
        // The tenant-safety guard: even when a caller passes an
        // explicit orgId, the BelongsToOrganization trait's
        // creating hook FORCES organization_id from bound context.
        // This is the documented anti-tenant-escape protection.
        $boundOrg = (int) app('current_organization_id');
        $otherOrg = OrganizationFactory::new()->create();

        $event = $this->service->dispatch(
            type:  'hot_lead',
            title: 'Tenant-safety guard',
            body:  null,
            data:  [],
            orgId: $otherOrg->id,
        );

        $this->assertSame($boundOrg, (int) $event->organization_id,
            'BelongsToOrganization trait must override explicit orgId param when context is bound.');
    }

    public function test_dispatch_without_orgId_uses_bound_context(): void
    {
        // The web-request path: TenantMiddleware binds
        // current_organization_id, the trait auto-fills.
        $boundOrg = app('current_organization_id');

        $event = $this->service->dispatch(
            type:  'hot_lead',
            title: 'Auto-filled',
        );

        $this->assertSame((int) $boundOrg, (int) $event->organization_id);
    }

    public function test_since_returns_events_with_id_greater_than_lastId(): void
    {
        // The poll-cursor contract: useRealtimeEvents calls
        // since(lastId) every few seconds. Must return ONLY new
        // events.
        $first  = $this->service->dispatch('a', 'First');
        $second = $this->service->dispatch('b', 'Second');
        $third  = $this->service->dispatch('c', 'Third');

        $newer = $this->service->since($first->id);

        $this->assertCount(2, $newer);
        $this->assertSame($second->id, $newer[0]->id,
            'Results must be ordered by id ascending.');
        $this->assertSame($third->id, $newer[1]->id);
    }

    public function test_since_excludes_the_lastId_event_itself(): void
    {
        // Strict inequality: `id > lastId`, not `>=`. Without
        // this guard the client would re-receive the same event
        // every poll cycle (toast spam).
        $event = $this->service->dispatch('a', 'Only event');

        $newer = $this->service->since($event->id);

        $this->assertCount(0, $newer);
    }

    public function test_since_caps_results_at_50(): void
    {
        // Back-pressure: even if 1000 events accumulated, a
        // single poll returns only 50 to keep the response size
        // bounded. The client polls again to catch up.
        for ($i = 0; $i < 60; $i++) {
            $this->service->dispatch('bulk', "Event {$i}");
        }

        $results = $this->service->since(0);

        $this->assertSame(50, $results->count(),
            'since() must cap at 50 results per call.');
    }

    public function test_cleanup_deletes_events_older_than_threshold(): void
    {
        // The cron-driven purge. Default threshold is 10 minutes;
        // events older than that get hard-deleted.
        // Seed: one fresh event + one old event.
        $fresh = $this->service->dispatch('fresh', 'Fresh');
        $old   = $this->service->dispatch('old', 'Old');
        // Manually backdate the "old" one.
        $old->forceFill(['created_at' => now()->subHour()])->save();

        $deleted = $this->service->cleanup(10);

        $this->assertSame(1, $deleted);
        $this->assertNull(RealtimeEvent::find($old->id),
            'Old event must be hard-deleted.');
        $this->assertNotNull(RealtimeEvent::find($fresh->id),
            'Fresh event must survive cleanup.');
    }

    public function test_cleanup_with_custom_threshold(): void
    {
        // Caller-supplied threshold: cleanup(5) wipes events
        // older than 5 minutes.
        $fresh = $this->service->dispatch('fresh', 'Just now');
        $borderline = $this->service->dispatch('borderline', '3 min ago');
        $borderline->forceFill(['created_at' => now()->subMinutes(3)])->save();
        $old = $this->service->dispatch('old', '7 min ago');
        $old->forceFill(['created_at' => now()->subMinutes(7)])->save();

        $deleted = $this->service->cleanup(5);

        $this->assertSame(1, $deleted,
            'Only the 7-min-old event must be cleaned (threshold=5).');
        $this->assertNotNull(RealtimeEvent::find($fresh->id));
        $this->assertNotNull(RealtimeEvent::find($borderline->id));
        $this->assertNull(RealtimeEvent::find($old->id));
    }

    public function test_cleanup_returns_zero_when_nothing_to_purge(): void
    {
        // The empty-store no-op: cleanup against a store with no
        // expired events must return 0, not negative or throw.
        $this->service->dispatch('fresh', 'Recent');

        $deleted = $this->service->cleanup(10);

        $this->assertSame(0, $deleted);
    }

    public function test_data_array_is_round_tripped_correctly(): void
    {
        // Complex nested data must round-trip via the JSON cast.
        // The SSE clients depend on getting the exact structure
        // back.
        $payload = [
            'visitor_id' => 999,
            'lead_form_id' => 42,
            'utm' => ['source' => 'google', 'medium' => 'cpc'],
            'tags' => ['hot', 'new', 'event_inquiry'],
        ];

        $event = $this->service->dispatch(
            type:  'hot_lead',
            title: 'Nested data',
            data:  $payload,
        );

        $reloaded = RealtimeEvent::find($event->id);
        $this->assertSame($payload, $reloaded->data,
            'Complex nested data must round-trip through the array cast.');
    }
}
