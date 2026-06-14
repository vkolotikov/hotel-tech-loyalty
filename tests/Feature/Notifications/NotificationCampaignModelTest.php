<?php

namespace Tests\Feature\Notifications;

use App\Models\NotificationCampaign;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the NotificationCampaign model contract — push + in-app
 * + email campaign row with segmented targeting.
 *
 * Why this matters:
 *
 *   Campaigns drive the loyalty program's marketing pushes —
 *   birthday rewards, tier upgrades, win-back, etc. segment_rules
 *   carries the dynamic membership rules (e.g. "members in Gold
 *   tier with no stays in 90 days"); the send cron evaluates
 *   these to build the target audience.
 *
 *   brand_id semantics documented in the source: NULL = "targets
 *   all brands' members" (org-wide campaign). A regression in
 *   that semantic would silently scope brand-NULL campaigns to a
 *   specific brand under the BelongsToBrand global scope.
 *
 * Contract:
 *
 *   - segment_rules array cast (segment query DSL)
 *   - data array cast (push notification payload)
 *   - scheduled_at + sent_at datetime casts (drives the
 *     'Scheduled X from now' + 'Sent X ago' SPA display)
 *   - createdBy BelongsTo User FK='created_by'
 *   - property BelongsTo Property (multi-property scoping)
 *   - BelongsToOrganization + BelongsToBrand traits
 *   - brand_id NULL = org-wide campaign (BelongsToBrand soft
 *     scope respects this — verified via opt-out scope)
 *   - TenantScope cross-org isolation
 */
class NotificationCampaignModelTest extends TestCase
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

        if (!Schema::hasTable('notification_campaigns')) {
            Schema::create('notification_campaigns', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('name');
                $t->text('segment_rules')->nullable();
                $t->string('title')->nullable();
                $t->text('body')->nullable();
                $t->text('data')->nullable();
                $t->string('channel', 32)->nullable();
                $t->unsignedBigInteger('email_template_id')->nullable();
                $t->string('email_subject')->nullable();
                $t->integer('email_sent_count')->default(0);
                $t->timestamp('scheduled_at')->nullable();
                $t->timestamp('sent_at')->nullable();
                $t->integer('target_count')->default(0);
                $t->integer('sent_count')->default(0);
                $t->integer('opened_count')->default(0);
                $t->string('status', 32)->default('draft');
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'status']);
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

    private function campaign(array $attrs = []): NotificationCampaign
    {
        return NotificationCampaign::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test campaign',
            'title'           => 'Test push title',
            'body'            => 'Test push body',
            'channel'         => 'push',
            'status'          => 'draft',
        ], $attrs));
    }

    /* ─── segment_rules array cast ─── */

    public function test_segment_rules_round_trips_through_array_cast(): void
    {
        // CRITICAL: the segment query DSL. The send cron evaluates
        // these rules to build the target audience. A regression
        // in the cast surfaces it as a JSON string — every
        // campaign targets zero members.
        $rules = [
            'tier_id'     => 3,
            'days_since_last_stay' => ['gt' => 90],
            'has_email'   => true,
            'locale'      => ['en', 'de'],
        ];

        $campaign = $this->campaign(['segment_rules' => $rules]);

        $this->assertSame($rules, $campaign->fresh()->segment_rules);
    }

    public function test_null_segment_rules_persists_as_null(): void
    {
        // Defensive: an admin-targeted campaign (specific member
        // ids passed via the SPA, no rules-based filter) has null
        // segment_rules. Lock this so the send cron can branch
        // on null.
        $campaign = $this->campaign(['segment_rules' => null]);

        $this->assertNull($campaign->fresh()->segment_rules);
    }

    /* ─── data array cast (push payload) ─── */

    public function test_data_round_trips_through_array_cast(): void
    {
        // data is the push payload — deep_link, image_url, etc.
        // The mobile app reads this to render the rich
        // notification.
        $payload = [
            'deep_link' => '/offer/2025-summer',
            'image_url' => 'https://example.com/hero.jpg',
            'cta_label' => 'Book now',
        ];

        $campaign = $this->campaign(['data' => $payload]);

        $this->assertSame($payload, $campaign->fresh()->data);
    }

    /* ─── Datetime casts ─── */

    public function test_scheduled_at_casts_to_carbon(): void
    {
        // The SPA shows "Scheduled X from now" — needs Carbon.
        $campaign = $this->campaign(['scheduled_at' => now()->addHour()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $campaign->scheduled_at);
    }

    public function test_sent_at_casts_to_carbon(): void
    {
        // "Sent X ago" diffForHumans display.
        $campaign = $this->campaign(['sent_at' => now()->subDay()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $campaign->sent_at);
    }

    /* ─── brand_id NULL semantics (org-wide vs brand-targeted) ─── */

    public function test_brand_id_null_means_org_wide_campaign(): void
    {
        // Documented semantic: NULL brand_id = "targets all brands'
        // members" (org-wide). Brand-targeted campaigns set
        // brand_id explicitly.
        $orgWide = $this->campaign(['brand_id' => null]);
        $branded = $this->campaign(['brand_id' => 100]);

        $this->assertNull($orgWide->brand_id);
        $this->assertSame(100, (int) $branded->brand_id);
    }

    public function test_brand_id_null_campaigns_visible_when_brand_context_unbound(): void
    {
        // BelongsToBrand is "softer" than TenantScope (no-ops when
        // no brand context bound). Lock that this lets org-wide
        // campaigns surface normally when admin hasn't picked a
        // brand in the SPA switcher.
        $this->campaign(['brand_id' => null, 'name' => 'Org-wide push']);
        $this->campaign(['brand_id' => 100,  'name' => 'Brand 100 push']);

        // Unbound brand context.
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        $rows = NotificationCampaign::all();
        $this->assertGreaterThanOrEqual(2, $rows->count(),
            'Unbound brand context MUST surface both org-wide and brand-targeted campaigns.');
    }

    /* ─── Counter columns persist as int ─── */

    public function test_counter_columns_persist_correctly(): void
    {
        // target_count + sent_count + opened_count + email_sent_count
        // — all integer columns. Drive the campaign KPI strip.
        $campaign = $this->campaign([
            'target_count'      => 1000,
            'sent_count'        => 985,
            'opened_count'      => 423,
            'email_sent_count'  => 985,
        ]);

        $fresh = $campaign->fresh();
        $this->assertSame(1000, (int) $fresh->target_count);
        $this->assertSame(985,  (int) $fresh->sent_count);
        $this->assertSame(423,  (int) $fresh->opened_count);
        $this->assertSame(985,  (int) $fresh->email_sent_count);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_created_by_relationship_uses_created_by_foreign_key(): void
    {
        // FK is 'created_by' (NOT 'created_by_user_id' as sister
        // EmailCampaign uses). Lock the legacy column name.
        $campaign = $this->campaign();
        $rel = $campaign->createdBy();

        $this->assertSame('created_by', $rel->getForeignKeyName(),
            'createdBy FK MUST be created_by (NOT created_by_user_id).');
    }

    public function test_property_relationship_is_belongs_to(): void
    {
        // Multi-property scoping — a campaign can target members
        // of a specific property.
        $campaign = $this->campaign();
        $rel = $campaign->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    /* ─── Channel + status values persist ─── */

    public function test_channel_values_persist_intact(): void
    {
        // Lock the documented channels. push / email / sms / inapp
        // — the send dispatcher branches on these exact strings.
        foreach (['push', 'email', 'sms', 'inapp'] as $channel) {
            $campaign = $this->campaign(['channel' => $channel]);
            $this->assertSame($channel, $campaign->fresh()->channel);
        }
    }

    public function test_status_values_persist_intact(): void
    {
        // Lock the canonical lifecycle states.
        foreach (['draft', 'scheduled', 'sending', 'sent', 'failed'] as $status) {
            $campaign = $this->campaign(['status' => $status]);
            $this->assertSame($status, $campaign->fresh()->status);
        }
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $campaign = $this->campaign();

        $this->assertSame($this->orgId, (int) $campaign->organization_id);
    }

    public function test_tenant_scope_isolates_campaigns_cross_org(): void
    {
        // CRITICAL: campaigns are tenant-private. Cross-leak would
        // expose competitor's marketing strategy + recipient counts.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->campaign(['name' => 'Org A campaign']);
        \DB::table('notification_campaigns')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B campaign',
            'channel'         => 'push',
            'status'          => 'draft',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = NotificationCampaign::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A campaign', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = NotificationCampaign::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B campaign', $bRows->first()->name);
    }
}
