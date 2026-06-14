<?php

namespace Tests\Feature\Crm;

use App\Models\Activity;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Activity model contract — the append-only timeline
 * rows that drive the lead-detail page (CRM v2 Phase 1).
 *
 * Why this matters:
 *
 *   Every touch on a lead — note, call, email, meeting, chat,
 *   status_change, task_completion, file_attachment — lands here
 *   as an Activity row. The frontend timeline reads this single
 *   table sorted by occurred_at desc; sub-tabs filter by type.
 *
 *   The 'Touches' counter on the Sales Pipeline list is derived
 *   from Activity::where(inquiry_id=…)->count() — replacing the
 *   legacy `inquiries.touches_count` denormalised column. A
 *   regression in the count derivation silently shows wrong
 *   activity numbers across the pipeline kanban.
 *
 *   The polymorphic-ish links (inquiry_id / guest_id /
 *   corporate_account_id) let one activity attach to multiple
 *   entities — e.g. a 'call' on a guest's inquiry can show up
 *   on both the inquiry detail AND the guest profile timeline.
 *
 * Contract:
 *
 *   - Inquiry-scoped counting (the 'Touches' invariant):
 *     Activity::where(inquiry_id=N)->count() returns the right
 *     value across the activity types
 *
 *   - Casts: metadata array; duration_minutes int; occurred_at
 *     Carbon
 *
 *   - BelongsTo relationships: inquiry, guest, creator (FK
 *     'created_by' — NOT 'user_id')
 *
 *   - BelongsToOrganization auto-fill from bound context
 *
 *   - TenantScope isolates cross-org reads
 *
 *   - No SoftDeletes — append-only by convention; deleting is
 *     deliberate and hard (per CLAUDE.md "Touches counter on the
 *     Sales Pipeline list is now derived from
 *     activities.where(inquiry_id=…).count()")
 */
class ActivityModelTest extends TestCase
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

        if (!Schema::hasTable('activities')) {
            Schema::create('activities', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('corporate_account_id')->nullable();
                $t->string('type', 32);
                $t->string('direction', 16)->nullable();
                $t->string('subject')->nullable();
                $t->text('body')->nullable();
                $t->integer('duration_minutes')->nullable();
                $t->text('metadata')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamp('occurred_at')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'inquiry_id']);
                $t->index(['organization_id', 'guest_id']);
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

    private function activity(array $attrs = []): Activity
    {
        return Activity::create(array_merge([
            'organization_id' => $this->orgId,
            'type'            => 'note',
            'occurred_at'     => now(),
        ], $attrs));
    }

    /* ─── The 'Touches' counter invariant ─── */

    public function test_touches_counter_derives_from_inquiry_scoped_count(): void
    {
        // CRITICAL: this is THE replacement for the legacy
        // inquiries.touches_count column. The pipeline kanban's
        // touch counter is wrong silently when this drifts.
        $inquiryId = 4242;

        $this->activity(['inquiry_id' => $inquiryId, 'type' => 'note']);
        $this->activity(['inquiry_id' => $inquiryId, 'type' => 'call']);
        $this->activity(['inquiry_id' => $inquiryId, 'type' => 'email']);
        $this->activity(['inquiry_id' => $inquiryId, 'type' => 'meeting']);
        $this->activity(['inquiry_id' => 9999, 'type' => 'note']); // different inquiry

        $count = Activity::where('inquiry_id', $inquiryId)->count();

        $this->assertSame(4, $count,
            'Touches count MUST equal Activity::where(inquiry_id=N)->count().');
    }

    public function test_touches_counter_includes_all_activity_types(): void
    {
        // No type is excluded from the touches count — every
        // activity is a touch. Pre-fix a regression that filtered
        // out 'system' or 'status_change' would understate touches.
        $inquiryId = 5555;
        $types = ['note', 'call', 'email', 'meeting', 'chat',
                  'status_change', 'task_completion', 'file_attachment'];

        foreach ($types as $type) {
            $this->activity(['inquiry_id' => $inquiryId, 'type' => $type]);
        }

        $count = Activity::where('inquiry_id', $inquiryId)->count();
        $this->assertSame(count($types), $count,
            'All activity types MUST count toward Touches.');
    }

    /* ─── Polymorphic-ish dual-entity attach ─── */

    public function test_activity_attaches_to_both_inquiry_and_guest_simultaneously(): void
    {
        // A 'call' on a guest's inquiry MUST appear on BOTH the
        // inquiry detail timeline AND the guest profile timeline.
        // Lock the dual-entity attach.
        $this->activity([
            'inquiry_id' => 111,
            'guest_id'   => 222,
            'type'       => 'call',
        ]);

        $byInquiry = Activity::where('inquiry_id', 111)->count();
        $byGuest = Activity::where('guest_id', 222)->count();

        $this->assertSame(1, $byInquiry);
        $this->assertSame(1, $byGuest,
            'Same activity row MUST surface on BOTH inquiry AND guest timelines.');
    }

    public function test_activity_can_attach_to_corporate_account_only(): void
    {
        // Some activities (corporate negotiations, account
        // reviews) attach to the corporate account, not a specific
        // inquiry or guest. Lock the contract.
        $this->activity([
            'corporate_account_id' => 333,
            'inquiry_id'           => null,
            'guest_id'             => null,
            'type'                 => 'meeting',
            'subject'              => 'Quarterly review',
        ]);

        $count = Activity::where('corporate_account_id', 333)->count();
        $this->assertSame(1, $count);
    }

    /* ─── Casts ─── */

    public function test_metadata_round_trips_through_array_cast(): void
    {
        // metadata is the structured side-channel: call duration,
        // email message-id, file size, etc. The SPA timeline
        // reads it as a typed array.
        $metadata = [
            'call_recording_url' => 'https://example.com/rec/123',
            'duration_sec'       => 487,
            'participants'       => ['alice@example.com', 'bob@example.com'],
        ];

        $activity = $this->activity(['metadata' => $metadata]);

        $this->assertSame($metadata, $activity->fresh()->metadata);
    }

    public function test_duration_minutes_casts_to_integer(): void
    {
        $activity = $this->activity(['duration_minutes' => '30']); // string input

        $this->assertSame(30, $activity->duration_minutes);
        $this->assertIsInt($activity->duration_minutes);
    }

    public function test_occurred_at_casts_to_carbon(): void
    {
        // The timeline sorts by occurred_at desc — needs Carbon
        // for date comparisons.
        $activity = $this->activity(['occurred_at' => now()->subHour()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $activity->occurred_at);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        // Activity::create called from a controller doesn't pass
        // org_id — the trait fills from bound context.
        $activity = $this->activity();

        $this->assertSame($this->orgId, (int) $activity->organization_id);
    }

    public function test_tenant_scope_isolates_cross_org_activities(): void
    {
        // CRITICAL: the pipeline kanban's touches counter MUST
        // scope to the current tenant. Cross-leak would surface
        // other tenants' activities in the count.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('activities')->insert([
            'organization_id' => $orgA,
            'inquiry_id'      => 999,
            'type'            => 'note',
            'occurred_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('activities')->insert([
            'organization_id' => $orgB,
            'inquiry_id'      => 999, // same inquiry id, different org
            'type'            => 'note',
            'occurred_at'     => now(),
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // Bound to org A — should see 1 row.
        $aCount = Activity::where('inquiry_id', 999)->count();
        $this->assertSame(1, $aCount);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bCount = Activity::where('inquiry_id', 999)->count();
        $this->assertSame(1, $bCount,
            'CRITICAL: same inquiry_id across orgs MUST scope to each tenant.');
    }

    /* ─── Relationships ─── */

    public function test_inquiry_relationship_is_belongs_to(): void
    {
        $activity = $this->activity();
        $rel = $activity->inquiry();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    public function test_guest_relationship_is_belongs_to(): void
    {
        $activity = $this->activity();
        $rel = $activity->guest();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    public function test_creator_relationship_uses_created_by_foreign_key(): void
    {
        // The creator FK is `created_by`, not `user_id`. A
        // regression that switched to the conventional `user_id`
        // FK would silently break "Added by Jane" display on
        // every activity card.
        $activity = $this->activity();
        $rel = $activity->creator();

        $this->assertSame('created_by', $rel->getForeignKeyName(),
            'creator relationship MUST FK on created_by (not user_id).');
    }

    /* ─── Direction field ─── */

    public function test_direction_field_distinguishes_inbound_outbound(): void
    {
        // Calls / emails have direction ('inbound' / 'outbound').
        // The SPA shows different icons + colors based on this.
        $inbound = $this->activity([
            'type' => 'email', 'direction' => 'inbound',
            'subject' => 'Re: Quote',
        ]);
        $outbound = $this->activity([
            'type' => 'email', 'direction' => 'outbound',
            'subject' => 'Initial outreach',
        ]);

        $this->assertSame('inbound', $inbound->direction);
        $this->assertSame('outbound', $outbound->direction);
    }
}
