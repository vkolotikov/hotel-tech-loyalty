<?php

namespace Tests\Feature\Visitor;

use App\Models\Visitor;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Visitor model contract — the persistent chat-widget
 * identity used across all conversations (visitor row spans
 * many ChatConversation rows: different sessions / tabs / days).
 *
 * Why the contract matters:
 *
 *   The Engagement Hub's online / offline classification — the
 *   green dot on every row, the smart-priority sort that bumps
 *   online + unread visitors to the top, the daily summary's
 *   'unanswered' count — ALL derive from `is_online`. A
 *   regression that drifted the 90-second threshold would skew
 *   every operational dashboard.
 *
 *   `is_lead`, the counter fields, and the timestamps are also
 *   load-bearing — they feed the Engagement feed's per-row
 *   priority score (rule-based hot-lead detection).
 *
 *   The $appends entry ensures is_online surfaces on every
 *   serialisation; without it, API responses would omit the
 *   field and the SPA's online dot would never light up.
 *
 * Contract:
 *
 *   is_online = last_seen_at present AND last_seen_at > now - 90s
 *     - null last_seen_at → false (never connected)
 *     - 89 seconds ago    → true (within window)
 *     - 91 seconds ago    → false (past window)
 *     - exactly 90s ago   → false (boundary — gt() not gte())
 *
 *   is_online appears in toArray() + toJson() via $appends
 *
 *   is_lead casts to bool
 *
 *   visit_count / page_views_count / messages_count cast to int
 *
 *   first_seen_at + last_seen_at cast to Carbon
 *
 *   BelongsToOrganization auto-fill from bound context
 *
 *   TenantScope isolates cross-org reads
 */
class VisitorModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpEngagementSchema(); // visitors table + chat_conversations

        // Organization::booted hook needs brands.
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

        // The engagement-schema visitors table is intentionally
        // narrow (Phase 3 backfill). Add the columns this test
        // exercises so the model casts surface.
        foreach (['visitor_key' => 'string', 'visitor_ip' => 'string',
                  'user_agent' => 'text', 'country' => 'string',
                  'first_seen_at' => 'timestamp', 'last_seen_at' => 'timestamp',
                  'visit_count' => 'integer', 'page_views_count' => 'integer',
                  'messages_count' => 'integer', 'brand_id' => 'unsignedBigInteger',
                  'guest_id' => 'unsignedBigInteger'] as $col => $type) {
            if (!Schema::hasColumn('visitors', $col)) {
                Schema::table('visitors', function ($t) use ($col, $type) {
                    if ($type === 'timestamp') $t->timestamp($col)->nullable();
                    elseif ($type === 'integer') $t->integer($col)->default(0);
                    elseif ($type === 'text') $t->text($col)->nullable();
                    elseif ($type === 'unsignedBigInteger') $t->unsignedBigInteger($col)->nullable();
                    else $t->string($col)->nullable();
                });
            }
        }

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

    private function visitor(array $attrs = []): Visitor
    {
        return Visitor::create(array_merge([
            'organization_id' => $this->orgId,
            'visitor_key'     => 'vk_' . uniqid(),
            'is_lead'         => false,
        ], $attrs));
    }

    /* ─── is_online — the 90-second threshold ─── */

    public function test_is_online_true_when_last_seen_within_90_seconds(): void
    {
        // CRITICAL: the green dot. A visitor whose last heartbeat
        // landed seconds ago MUST show as online — that's what
        // bumps them to the top of the Engagement feed's smart
        // sort.
        $visitor = $this->visitor(['last_seen_at' => now()->subSeconds(30)]);

        $this->assertTrue($visitor->is_online,
            'last_seen_at 30s ago MUST yield is_online=true.');
    }

    public function test_is_online_true_at_89_seconds(): void
    {
        // The just-within-window edge. Locks the threshold so a
        // regression to 60s / 120s would surface here.
        $visitor = $this->visitor(['last_seen_at' => now()->subSeconds(89)]);

        $this->assertTrue($visitor->is_online,
            '89s ago MUST still be online (within 90s window).');
    }

    public function test_is_online_false_at_91_seconds(): void
    {
        // The just-past-window edge.
        $visitor = $this->visitor(['last_seen_at' => now()->subSeconds(91)]);

        $this->assertFalse($visitor->is_online,
            '91s ago MUST yield is_online=false (past 90s window).');
    }

    public function test_is_online_false_when_last_seen_is_null(): void
    {
        // Never-connected visitor (rare — visitor rows usually
        // have at least one heartbeat) MUST NOT report online.
        $visitor = $this->visitor(['last_seen_at' => null]);

        $this->assertFalse($visitor->is_online,
            'Null last_seen_at MUST yield is_online=false (never connected).');
    }

    public function test_is_online_false_when_last_seen_long_ago(): void
    {
        $visitor = $this->visitor(['last_seen_at' => now()->subDays(7)]);

        $this->assertFalse($visitor->is_online);
    }

    /* ─── is_online surfaces via $appends ─── */

    public function test_is_online_appears_in_to_array_output(): void
    {
        // The $appends entry ensures is_online surfaces on every
        // serialisation. Without it, the SPA's API responses
        // would omit the field and the green dot would never
        // light up.
        $visitor = $this->visitor(['last_seen_at' => now()->subSeconds(10)]);

        $array = $visitor->toArray();
        $this->assertArrayHasKey('is_online', $array,
            'is_online MUST surface in toArray() via $appends.');
        $this->assertTrue($array['is_online']);
    }

    public function test_is_online_appears_in_to_json_output(): void
    {
        $visitor = $this->visitor(['last_seen_at' => now()->subSeconds(10)]);
        $decoded = json_decode($visitor->toJson(), true);

        $this->assertArrayHasKey('is_online', $decoded);
        $this->assertTrue($decoded['is_online']);
    }

    /* ─── is_lead boolean cast ─── */

    public function test_is_lead_casts_to_boolean(): void
    {
        // SQLite stores booleans as 0/1; the cast surfaces them
        // as true/false. The Engagement feed's hot-lead boost
        // depends on this being a proper bool, not a 0/1.
        $lead = $this->visitor(['is_lead' => true]);
        $anon = $this->visitor(['is_lead' => false]);

        $this->assertTrue($lead->is_lead);
        $this->assertFalse($anon->is_lead);
        $this->assertIsBool($lead->is_lead);
    }

    /* ─── Integer counters ─── */

    public function test_visit_count_page_views_messages_count_cast_to_int(): void
    {
        // Counter fields drive the smart-priority sort + the
        // visitor's session history display. Type integrity is
        // load-bearing for the SPA's arithmetic.
        $visitor = $this->visitor([
            'visit_count'      => '5',  // string input
            'page_views_count' => 12,
            'messages_count'   => '3',
        ]);

        $this->assertSame(5,  $visitor->visit_count);
        $this->assertSame(12, $visitor->page_views_count);
        $this->assertSame(3,  $visitor->messages_count);
        $this->assertIsInt($visitor->visit_count);
        $this->assertIsInt($visitor->page_views_count);
        $this->assertIsInt($visitor->messages_count);
    }

    /* ─── Datetime casts ─── */

    public function test_first_seen_at_and_last_seen_at_cast_to_carbon(): void
    {
        // The is_online accessor calls $this->last_seen_at->gt(...)
        // — needs Carbon, not a raw string. Lock the cast.
        $visitor = $this->visitor([
            'first_seen_at' => now()->subDays(7),
            'last_seen_at'  => now()->subMinute(),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $visitor->first_seen_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $visitor->last_seen_at);
    }

    /* ─── BelongsToOrganization auto-fill ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        // Widget heartbeat endpoints don't pass org_id explicitly
        // — the trait fills from bound context.
        $visitor = $this->visitor();

        $this->assertSame($this->orgId, (int) $visitor->organization_id);
    }

    /* ─── TenantScope cross-org isolation ─── */

    public function test_tenant_scope_isolates_org_a_from_org_b_reads(): void
    {
        // CRITICAL: a visitor with the same visitor_key across two
        // tenants MUST NOT cross-leak. Pre-isolation bugs in chat
        // platforms have leaked one tenant's visitor history into
        // another's dashboards.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('visitors')->insert([
            'organization_id' => $orgA,
            'visitor_key'     => 'shared_vk',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('visitors')->insert([
            'organization_id' => $orgB,
            'visitor_key'     => 'shared_vk',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // Bound to org A.
        $rowsForA = Visitor::all();
        $this->assertCount(1, $rowsForA);
        $this->assertSame($orgA, (int) $rowsForA->first()->organization_id);

        // Switch to org B.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);

        $rowsForB = Visitor::all();
        $this->assertCount(1, $rowsForB);
        $this->assertSame($orgB, (int) $rowsForB->first()->organization_id);
    }

    /* ─── Relationships ─── */

    public function test_guest_relationship_returns_belongs_to(): void
    {
        // The guest link is set when widget chat captures a lead.
        // Lock the relationship type so a future refactor doesn't
        // silently switch to a hasOne/morph.
        $visitor = $this->visitor();
        $rel = $visitor->guest();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    public function test_conversations_relationship_returns_has_many(): void
    {
        $visitor = $this->visitor();
        $rel = $visitor->conversations();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
    }
}
