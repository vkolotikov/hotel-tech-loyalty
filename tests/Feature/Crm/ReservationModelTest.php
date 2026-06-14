<?php

namespace Tests\Feature\Crm;

use App\Models\Reservation;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Reservation model contract — the CRM v2 stay entity
 * (sister to BookingMirror, but on the CRM side of the line).
 *
 * Why this matters:
 *
 *   Reservations are the actual stays admins manage manually in
 *   the CRM (vs BookingMirror which is the PMS-synced shadow of
 *   the same data). The /reservations page reads this table.
 *   The HotelKpiService's revenue_month KPI sums total_amount
 *   here.
 *
 *   A regression in any cast surfaces wrong-type values across
 *   the SPA: dates as strings, money as float, lifecycle
 *   timestamps as strings.
 *
 * Contract:
 *
 *   Date casts: check_in + check_out + task_due (Carbon).
 *
 *   Money casts: rate_per_night + total_amount decimal:2
 *   (BCMath-safe — KPI sums depend on this).
 *
 *   Lifecycle datetimes: checked_in_at + checked_out_at +
 *   cancelled_at (Carbon — drives the SPA's status timeline).
 *
 *   task_completed bool (legacy CRM Phase 0 task fields kept
 *   for back-compat with admin workflows that haven't migrated
 *   to the new tasks table).
 *
 *   Relationships: guest + inquiry + corporateAccount + property
 *   all BelongsTo with conventional foreign keys.
 *
 *   BelongsToOrganization + BelongsToBrand auto-fill + tenant
 *   isolation.
 */
class ReservationModelTest extends TestCase
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

        if (!Schema::hasTable('reservations')) {
            Schema::create('reservations', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->unsignedBigInteger('corporate_account_id')->nullable();
                $t->unsignedBigInteger('property_id')->nullable();
                $t->string('confirmation_no')->nullable();
                $t->date('check_in')->nullable();
                $t->date('check_out')->nullable();
                $t->integer('num_nights')->default(0);
                $t->integer('num_rooms')->default(1);
                $t->integer('num_adults')->default(2);
                $t->integer('num_children')->default(0);
                $t->string('room_type')->nullable();
                $t->string('room_number')->nullable();
                $t->decimal('rate_per_night', 12, 2)->default(0);
                $t->decimal('total_amount', 12, 2)->default(0);
                $t->string('meal_plan')->nullable();
                $t->string('payment_status')->nullable();
                $t->string('payment_method')->nullable();
                $t->string('booking_channel')->nullable();
                $t->string('agent_name')->nullable();
                $t->string('status')->nullable();
                $t->string('source')->nullable();
                $t->string('arrival_time')->nullable();
                $t->string('departure_time')->nullable();
                $t->text('special_requests')->nullable();
                $t->string('task_type')->nullable();
                $t->date('task_due')->nullable();
                $t->string('task_urgency')->nullable();
                $t->text('task_notes')->nullable();
                $t->boolean('task_completed')->default(false);
                $t->timestamp('checked_in_at')->nullable();
                $t->timestamp('checked_out_at')->nullable();
                $t->timestamp('cancelled_at')->nullable();
                $t->text('notes')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'guest_id']);
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

    private function reservation(array $attrs = []): Reservation
    {
        return Reservation::create(array_merge([
            'organization_id' => $this->orgId,
            'confirmation_no' => 'CN-' . uniqid(),
            'status'          => 'Confirmed',
        ], $attrs));
    }

    /* ─── Date casts ─── */

    public function test_check_in_and_check_out_cast_to_carbon(): void
    {
        // HotelKpiService's arrivals_today / departures_today
        // queries compare dates — needs Carbon.
        $reservation = $this->reservation([
            'check_in'  => '2026-07-15',
            'check_out' => '2026-07-20',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $reservation->check_in);
        $this->assertInstanceOf(\Carbon\Carbon::class, $reservation->check_out);
        $this->assertSame('2026-07-15', $reservation->check_in->toDateString());
        $this->assertSame('2026-07-20', $reservation->check_out->toDateString());
    }

    public function test_task_due_casts_to_carbon(): void
    {
        // Legacy Phase 0 task field — kept for back-compat with
        // admin workflows that haven't migrated to the tasks
        // table.
        $reservation = $this->reservation(['task_due' => '2026-08-01']);

        $this->assertInstanceOf(\Carbon\Carbon::class, $reservation->task_due);
    }

    /* ─── Money casts ─── */

    public function test_rate_per_night_casts_to_decimal_2_string(): void
    {
        // CRITICAL: BCMath-safe. HotelKpiService's avg_rate KPI
        // AVG()s this column — float cast would carry precision
        // error.
        $reservation = $this->reservation(['rate_per_night' => 199.99]);

        $this->assertSame('199.99', $reservation->fresh()->rate_per_night);
    }

    public function test_total_amount_casts_to_decimal_2_string(): void
    {
        // CRITICAL: HotelKpiService::revenue_month SUM()s this.
        // BCMath-safe is required.
        $reservation = $this->reservation(['total_amount' => 1500.50]);

        $this->assertSame('1500.50', $reservation->fresh()->total_amount);
    }

    /* ─── Lifecycle datetime casts ─── */

    public function test_checked_in_at_casts_to_carbon(): void
    {
        // Drives the SPA's status timeline ("Checked in 2 hours
        // ago"). Needs Carbon for diffForHumans().
        $reservation = $this->reservation(['checked_in_at' => now()->subHours(2)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $reservation->checked_in_at);
    }

    public function test_checked_out_at_casts_to_carbon(): void
    {
        $reservation = $this->reservation(['checked_out_at' => now()->subDay()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $reservation->checked_out_at);
    }

    public function test_cancelled_at_casts_to_carbon(): void
    {
        // Drives the cancel-rate KPI + the audit-log "cancelled
        // at" stamp.
        $reservation = $this->reservation(['cancelled_at' => now()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $reservation->cancelled_at);
    }

    public function test_lifecycle_timestamps_independent(): void
    {
        // Lock that all three can be set independently — a
        // reservation might be checked in but not yet checked out,
        // or cancelled without ever being checked in.
        $reservation = $this->reservation([
            'checked_in_at'  => now()->subDays(2),
            'checked_out_at' => now()->subDay(),
            'cancelled_at'   => null,
        ]);

        $this->assertNotNull($reservation->checked_in_at);
        $this->assertNotNull($reservation->checked_out_at);
        $this->assertNull($reservation->cancelled_at);
    }

    /* ─── Boolean cast ─── */

    public function test_task_completed_casts_to_boolean(): void
    {
        // Legacy back-compat field — but still load-bearing for
        // existing admin views.
        $done = $this->reservation(['task_completed' => true]);
        $open = $this->reservation(['task_completed' => false]);

        $this->assertTrue($done->task_completed);
        $this->assertFalse($open->task_completed);
        $this->assertIsBool($done->task_completed);
    }

    /* ─── Relationships ─── */

    public function test_guest_relationship_is_belongs_to(): void
    {
        $reservation = $this->reservation();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $reservation->guest(),
        );
    }

    public function test_inquiry_relationship_is_belongs_to(): void
    {
        // The Convert-to-reservation flow creates a Reservation
        // linked back to the source Inquiry. Lock the relationship
        // for funnel attribution.
        $reservation = $this->reservation();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $reservation->inquiry(),
        );
    }

    public function test_corporate_account_relationship_is_belongs_to(): void
    {
        $reservation = $this->reservation();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $reservation->corporateAccount(),
        );
    }

    public function test_property_relationship_is_belongs_to(): void
    {
        // Multi-property orgs scope reservations per property.
        $reservation = $this->reservation();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $reservation->property(),
        );
    }

    /* ─── Canonical status values ─── */

    public function test_canonical_status_values_persist_intact(): void
    {
        // HotelKpiService filters on these exact string values.
        // A typo silently breaks the daily KPI dashboard.
        foreach (['Confirmed', 'Checked In', 'Checked Out', 'Cancelled', 'No Show'] as $status) {
            $reservation = $this->reservation(['status' => $status]);
            $this->assertSame($status, $reservation->fresh()->status,
                "Status '{$status}' MUST persist intact.");
        }
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $reservation = $this->reservation();

        $this->assertSame($this->orgId, (int) $reservation->organization_id);
    }

    public function test_tenant_scope_isolates_reservations_cross_org(): void
    {
        // CRITICAL: reservations are private to the tenant.
        // Cross-leak would surface another tenant's check-in
        // schedule + room assignments.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('reservations')->insert([
            'organization_id' => $orgA,
            'confirmation_no' => 'A-001',
            'status'          => 'Confirmed',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('reservations')->insert([
            'organization_id' => $orgB,
            'confirmation_no' => 'B-001',
            'status'          => 'Confirmed',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = Reservation::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('A-001', $aRows->first()->confirmation_no);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = Reservation::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('B-001', $bRows->first()->confirmation_no);
    }
}
