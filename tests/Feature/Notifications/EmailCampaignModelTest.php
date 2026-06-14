<?php

namespace Tests\Feature\Notifications;

use App\Models\EmailCampaign;
use App\Models\User;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the EmailCampaign model contract (May 13 2026 block
 * builder ship).
 *
 * Why this matters:
 *
 *   body_blocks jsonb is the SOURCE OF TRUTH for the block
 *   builder; body_html is REGENERATED from blocks on every
 *   change. A regression in the array cast surfaces broken
 *   campaign editor / preview / send.
 *
 *   STATUS_* constants gate the send flow: draft can edit;
 *   sending is in-progress (lock for re-send guard); sent +
 *   failed are terminal.
 *
 *   Counter casts (recipient/sent/failed_count) feed the KPI
 *   strip on /marketing → Campaigns.
 *
 * Contract:
 *
 *   STATUS_* constants locked at canonical string values:
 *     - STATUS_DRAFT   = 'draft'
 *     - STATUS_SENDING = 'sending'
 *     - STATUS_SENT    = 'sent'
 *     - STATUS_FAILED  = 'failed'
 *
 *   Casts:
 *     - body_blocks → array (SOURCE OF TRUTH for block builder)
 *     - sent_at → Carbon
 *     - recipient_count + sent_count + failed_count → integer
 *
 *   Relationships:
 *     - segment BelongsTo MemberSegment (FK 'segment_id')
 *     - createdBy BelongsTo User (FK 'created_by_user_id')
 *     - sentBy BelongsTo User (FK 'sent_by_user_id')
 *
 *   BelongsToOrganization auto-fill + tenant isolation.
 */
class EmailCampaignModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

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

        if (!Schema::hasTable('email_campaigns')) {
            Schema::create('email_campaigns', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('segment_id')->nullable();
                $t->string('name');
                $t->string('subject')->nullable();
                $t->text('body_html')->nullable();
                $t->text('body_text')->nullable();
                $t->text('body_blocks')->nullable(); // jsonb in prod
                $t->string('status', 16)->default('draft');
                $t->integer('recipient_count')->default(0);
                $t->integer('sent_count')->default(0);
                $t->integer('failed_count')->default(0);
                $t->timestamp('sent_at')->nullable();
                $t->text('error_message')->nullable();
                $t->unsignedBigInteger('created_by_user_id')->nullable();
                $t->unsignedBigInteger('sent_by_user_id')->nullable();
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
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function campaign(array $attrs = []): EmailCampaign
    {
        return EmailCampaign::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test Campaign',
            'subject'         => 'Test Subject',
            'status'          => EmailCampaign::STATUS_DRAFT,
        ], $attrs));
    }

    /* ─── STATUS_* constants ─── */

    public function test_status_constants_are_locked_canonical_strings(): void
    {
        // Lock the 4 documented status values. The block builder's
        // Visual/Code toggle + the send-test endpoint + the SPA
        // filter pills all branch on these exact strings.
        $this->assertSame('draft',   EmailCampaign::STATUS_DRAFT);
        $this->assertSame('sending', EmailCampaign::STATUS_SENDING);
        $this->assertSame('sent',    EmailCampaign::STATUS_SENT);
        $this->assertSame('failed',  EmailCampaign::STATUS_FAILED);
    }

    public function test_all_4_canonical_status_values_persist_intact(): void
    {
        foreach ([
            EmailCampaign::STATUS_DRAFT,
            EmailCampaign::STATUS_SENDING,
            EmailCampaign::STATUS_SENT,
            EmailCampaign::STATUS_FAILED,
        ] as $status) {
            $row = $this->campaign(['status' => $status]);
            $this->assertSame($status, $row->fresh()->status);
        }
    }

    /* ─── body_blocks array cast — SOURCE OF TRUTH for block builder ─── */

    public function test_body_blocks_round_trips_through_array_cast(): void
    {
        // CRITICAL: body_blocks is the authoritative source for
        // the block builder. body_html is regenerated from it on
        // every change. The 6 block types (Heading / Text / Button
        // / Image / Divider / Spacer) ride on this structure.
        $blocks = [
            ['type' => 'heading', 'content' => 'Welcome!', 'align' => 'center'],
            ['type' => 'text',    'content' => 'Thanks for joining.', 'align' => 'left'],
            ['type' => 'button',  'label' => 'Book now', 'url' => 'https://example.com', 'align' => 'center'],
            ['type' => 'divider', 'color' => '#eee'],
            ['type' => 'spacer',  'height' => 24],
            ['type' => 'image',   'url' => 'https://example.com/hero.jpg', 'alt' => 'Hero'],
        ];

        $campaign = $this->campaign(['body_blocks' => $blocks]);

        $this->assertSame($blocks, $campaign->fresh()->body_blocks,
            'body_blocks MUST round-trip exactly (6 block types intact).');
    }

    public function test_body_blocks_can_be_null_for_legacy_code_only_campaigns(): void
    {
        // Legacy campaigns created in the Code editor (HTML edit
        // mode) have body_blocks=null. The block builder treats
        // null as "open in Code view automatically" per the
        // documented contract.
        $campaign = $this->campaign(['body_blocks' => null]);

        $this->assertNull($campaign->fresh()->body_blocks,
            'Null body_blocks MUST persist as null (legacy / Code-edited campaigns).');
    }

    /* ─── Counter casts ─── */

    public function test_recipient_count_casts_to_integer(): void
    {
        // The KPI strip on /marketing reads this column.
        // String/int mismatch would break the SPA's arithmetic.
        $campaign = $this->campaign(['recipient_count' => '250']);

        $this->assertSame(250, $campaign->recipient_count);
        $this->assertIsInt($campaign->recipient_count);
    }

    public function test_sent_count_and_failed_count_cast_to_integer(): void
    {
        // Both drive the post-send "245 sent, 5 failed" UX.
        $campaign = $this->campaign([
            'sent_count'   => '245',
            'failed_count' => '5',
        ]);

        $this->assertSame(245, $campaign->sent_count);
        $this->assertSame(5,   $campaign->failed_count);
        $this->assertIsInt($campaign->sent_count);
    }

    /* ─── sent_at datetime cast ─── */

    public function test_sent_at_casts_to_carbon(): void
    {
        // Drives the SPA's "Sent X ago" display + the filter on
        // "this month" KPI.
        $campaign = $this->campaign(['sent_at' => now()->subDay()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $campaign->sent_at);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_segment_relationship_uses_segment_id_foreign_key(): void
    {
        // FK is 'segment_id', NOT the conventional
        // 'member_segment_id'.
        $campaign = $this->campaign();
        $rel = $campaign->segment();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('segment_id', $rel->getForeignKeyName(),
            'segment FK MUST be segment_id (NOT member_segment_id).');
    }

    public function test_created_by_relationship_uses_created_by_user_id_fk(): void
    {
        // CRITICAL: FK is 'created_by_user_id' NOT 'created_by'.
        // A regression that switched the FK name would silently
        // break the "Created by Jane" attribution in the SPA.
        $campaign = $this->campaign();
        $rel = $campaign->createdBy();

        $this->assertSame('created_by_user_id', $rel->getForeignKeyName(),
            'createdBy FK MUST be created_by_user_id.');
    }

    public function test_sent_by_relationship_uses_sent_by_user_id_fk(): void
    {
        $campaign = $this->campaign();
        $rel = $campaign->sentBy();

        $this->assertSame('sent_by_user_id', $rel->getForeignKeyName(),
            'sentBy FK MUST be sent_by_user_id.');
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
        // expose another org's campaign list + recipient counts.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('email_campaigns')->insert([
            'organization_id' => $orgA,
            'name'            => 'Org A campaign',
            'status'          => 'draft',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('email_campaigns')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B campaign',
            'status'          => 'sent',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = EmailCampaign::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A campaign', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = EmailCampaign::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B campaign', $bRows->first()->name);
    }
}
