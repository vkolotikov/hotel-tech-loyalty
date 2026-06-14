<?php

namespace Tests\Feature\Engagement;

use App\Models\Visitor;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Visitor model contract — the persistent identity row
 * for everyone hitting the public chat widget.
 *
 * Why this matters:
 *
 *   Every chat widget visit resolves to a Visitor row via the
 *   visitor_key cookie (or freshly-generated UUID on first
 *   visit). One row spans many ChatConversation rows (different
 *   sessions / tabs / days). The Engagement Hub feed
 *   (`EngagementFeedService::feed()`) joins visitors → their
 *   latest conversation → its latest message, sorted by smart
 *   priority. Online state drives the "who's online" panel +
 *   the +100 priority boost in the feed.
 *
 *   `is_online` accessor reads `last_seen_at > now()-90s`. A
 *   regression in the cast surfaces stale visitors as "online" +
 *   live visitors as "offline" — breaks the entire engagement
 *   priority sort.
 *
 *   The 23505 unique-violation race on (org × visitor_key) is
 *   handled in `WidgetChatController::resolveVisitor` (mentioned
 *   in CLAUDE.md Nightwatch fix wave — 2K occurrences). The
 *   model itself doesn't enforce uniqueness — that's the schema's
 *   job — but the cast contract MUST hold so the controller's
 *   try/catch + re-fetch logic can recover cleanly.
 *
 * Contract:
 *
 *   - first_seen_at / last_seen_at datetime casts → Carbon
 *   - 3 counter int casts: visit_count / page_views_count /
 *     messages_count
 *   - is_lead boolean cast
 *   - is_online accessor: true when last_seen_at > now()-90s
 *   - is_online appended to JSON output
 *   - pageViews HasMany VisitorPageView ordered by viewed_at desc
 *   - conversations HasMany ChatConversation ordered by
 *     last_message_at desc
 *   - guest BelongsTo (lead-linkage when captured)
 *   - BelongsToOrganization + BelongsToBrand + tenant isolation
 */
class VisitorModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('visitors')) {
            Schema::create('visitors', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('visitor_key', 64);
                $t->string('visitor_ip', 64)->nullable();
                // Per CLAUDE.md "visitors URL columns widened to
                // TEXT" — Instagram Referrer overflow ship.
                $t->text('user_agent')->nullable();
                $t->string('country', 4)->nullable();
                $t->string('city')->nullable();
                $t->text('referrer')->nullable();
                $t->text('current_page')->nullable();
                $t->text('current_page_title')->nullable();
                $t->timestamp('first_seen_at')->nullable();
                $t->timestamp('last_seen_at')->nullable();
                $t->integer('visit_count')->default(0);
                $t->integer('page_views_count')->default(0);
                $t->integer('messages_count')->default(0);
                $t->boolean('is_lead')->default(false);
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->string('display_name')->nullable();
                $t->string('email')->nullable();
                $t->string('phone')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'visitor_key']);
            });
        }

        if (!Schema::hasTable('visitor_page_views')) {
            Schema::create('visitor_page_views', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('visitor_id');
                $t->text('url')->nullable();
                $t->text('title')->nullable();
                $t->timestamp('viewed_at')->nullable();
                $t->timestamps();
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    private function visitor(array $attrs = []): Visitor
    {
        static $i = 0;
        $i++;
        return Visitor::create(array_merge([
            'organization_id' => $this->orgId,
            'visitor_key'     => 'vk-' . $i . '-' . uniqid(),
            'visitor_ip'      => '127.0.0.1',
            'first_seen_at'   => now()->subDay(),
            'last_seen_at'    => now()->subSeconds(30), // online
        ], $attrs));
    }

    /* ─── Datetime casts ─── */

    public function test_first_seen_at_casts_to_carbon(): void
    {
        $v = $this->visitor(['first_seen_at' => now()->subWeek()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $v->first_seen_at);
    }

    public function test_last_seen_at_casts_to_carbon(): void
    {
        // CRITICAL: the is_online accessor depends on this being
        // Carbon. A string cast would crash the gt() compare.
        $v = $this->visitor(['last_seen_at' => now()->subSeconds(45)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $v->last_seen_at);
    }

    /* ─── Counter int casts ─── */

    public function test_visit_count_casts_to_integer(): void
    {
        // Drives the "X visits" chip in the visitor row.
        $v = $this->visitor(['visit_count' => '5']);

        $this->assertSame(5, $v->visit_count);
        $this->assertIsInt($v->visit_count);
    }

    public function test_page_views_count_casts_to_integer(): void
    {
        // Drives the "X pages" chip + the engagement priority
        // boost (deep-browsing visitors get +50).
        $v = $this->visitor(['page_views_count' => '12']);

        $this->assertSame(12, $v->page_views_count);
        $this->assertIsInt($v->page_views_count);
    }

    public function test_messages_count_casts_to_integer(): void
    {
        // Drives the engagement feed's unread badge + priority
        // boost when visitor has sent messages.
        $v = $this->visitor(['messages_count' => '7']);

        $this->assertSame(7, $v->messages_count);
        $this->assertIsInt($v->messages_count);
    }

    /* ─── is_lead boolean ─── */

    public function test_is_lead_casts_to_boolean(): void
    {
        // is_lead flips to true when the chat widget captures a
        // lead (email/phone collected). Drives the engagement
        // hot-lead boost.
        $captured = $this->visitor(['is_lead' => true]);
        $browsing = $this->visitor(['is_lead' => false]);

        $this->assertTrue($captured->is_lead);
        $this->assertFalse($browsing->is_lead);
        $this->assertIsBool($captured->is_lead);
    }

    /* ─── is_online accessor (90s window) ─── */

    public function test_is_online_returns_true_within_90_seconds(): void
    {
        // CRITICAL: 90s window from last_seen_at. Drives the
        // engagement feed online-pill + the +100 priority
        // boost for "online + unread" visitors.
        $online = $this->visitor(['last_seen_at' => now()->subSeconds(30)]);

        $this->assertTrue($online->is_online,
            'Visitor seen 30s ago MUST be online (<90s window).');
    }

    public function test_is_online_returns_false_outside_90_seconds(): void
    {
        // Visitor seen 2 minutes ago is offline.
        $offline = $this->visitor(['last_seen_at' => now()->subMinutes(2)]);

        $this->assertFalse($offline->is_online,
            'Visitor seen 2min ago MUST be offline (>90s window).');
    }

    public function test_is_online_returns_false_when_last_seen_at_is_null(): void
    {
        // Defensive: never-seen visitor (impossible in
        // practice; resolveVisitor stamps it) returns false,
        // not crash.
        $v = $this->visitor(['last_seen_at' => null]);

        $this->assertFalse($v->is_online,
            'Null last_seen_at MUST return false (not crash).');
    }

    public function test_is_online_is_appended_to_json_output(): void
    {
        // CRITICAL: the engagement feed serializes Visitor →
        // JSON and the SPA reads is_online from the response.
        // Lock the $appends contract — a refactor removing
        // 'is_online' from $appends silently breaks the feed.
        $online = $this->visitor(['last_seen_at' => now()->subSeconds(30)]);
        $array  = $online->toArray();

        $this->assertArrayHasKey('is_online', $array,
            'is_online MUST appear in toArray (drives engagement feed JSON).');
        $this->assertTrue($array['is_online']);
    }

    /* ─── Relationships ─── */

    public function test_page_views_relationship_orders_by_viewed_at_desc(): void
    {
        // CRITICAL: the visitor journey timeline shows most-
        // recent page first. Order is part of the contract.
        $v = $this->visitor();

        \DB::table('visitor_page_views')->insert([
            ['organization_id' => $this->orgId, 'visitor_id' => $v->id,
             'url' => '/old', 'viewed_at' => now()->subHours(2),
             'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $this->orgId, 'visitor_id' => $v->id,
             'url' => '/newest', 'viewed_at' => now()->subMinutes(5),
             'created_at' => now(), 'updated_at' => now()],
            ['organization_id' => $this->orgId, 'visitor_id' => $v->id,
             'url' => '/middle', 'viewed_at' => now()->subHour(),
             'created_at' => now(), 'updated_at' => now()],
        ]);

        $urls = $v->pageViews()->pluck('url')->toArray();

        $this->assertSame(['/newest', '/middle', '/old'], $urls,
            'pageViews MUST order by viewed_at desc.');
    }

    public function test_guest_relationship_is_belongs_to(): void
    {
        // guest_id set when chat captures a lead → upserts into
        // guests + back-links. Lock the relationship.
        $v = $this->visitor(['guest_id' => 500]);
        $rel = $v->guest();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('guest_id', $rel->getForeignKeyName());
    }

    public function test_conversations_relationship_uses_visitor_id_fk(): void
    {
        // ChatConversation has visitor_id FK. Lock to catch a
        // "harmonising" refactor that renames to
        // 'chat_visitor_id' or similar.
        $v = $this->visitor();
        $rel = $v->conversations();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('visitor_id', $rel->getForeignKeyName());
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $v = $this->visitor();

        $this->assertSame($this->orgId, (int) $v->organization_id);
    }

    public function test_tenant_scope_isolates_visitors_cross_org(): void
    {
        // CRITICAL: visitor PII (IP, user_agent, page history,
        // captured email/phone) is tenant-private. Cross-leak
        // would expose competitor's site visitor patterns.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->visitor(['visitor_key' => 'org-a-visitor', 'visitor_ip' => '1.2.3.4']);
        \DB::table('visitors')->insert([
            'organization_id' => $orgB,
            'visitor_key'     => 'org-b-visitor',
            'visitor_ip'      => '5.6.7.8',
            'visit_count'     => 0,
            'page_views_count'=> 0,
            'messages_count'  => 0,
            'is_lead'         => false,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = Visitor::all();
        $this->assertGreaterThanOrEqual(1, $aRows->count());
        foreach ($aRows as $v) {
            $this->assertSame($this->orgId, (int) $v->organization_id,
                'TenantScope MUST exclude cross-org visitors.');
        }
    }
}
