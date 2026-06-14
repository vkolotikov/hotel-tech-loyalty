<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Scopes\IntegrationDataScope;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the BookingMirror model contract — the PMS-mirrored
 * reservation row that drives booking confirms, refunds, and
 * Smoobu sync.
 *
 * Why this matters:
 *
 *   - CLAUDE.md flags `protected \$table = 'booking_mirror'`
 *     (SINGULAR) as a documented footgun: two migrations shipped
 *     with the plural form and failed every prod deploy until
 *     fixed (commit c583ffc6). A regression that drops the
 *     explicit table name surfaces as a 'relation booking_mirrors
 *     does not exist' error in production.
 *
 *   - IntegrationDataScope hides synced rows when Smoobu is
 *     disabled — without the scope, an admin who paused the
 *     integration would still see live mirror rows in the SPA.
 *     Re-enabling restores them instantly (no data loss).
 *
 *   - Money columns (price_total / price_paid / refunded_amount /
 *     prepayment / deposit) ALL cast to decimal:2 strings —
 *     BCMath-safe. A regression to float cast silently surfaces
 *     199.99 as 199.989999...
 *
 *   - prepayment_paid + deposit_paid are bool gates the booking
 *     widget reads to decide what to charge.
 *
 *   - raw_json carries the full PMS payload for diagnostic
 *     replay. Array cast lets the diag tools read it as a typed
 *     map.
 */
class BookingMirrorModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // booking_mirror lives in the BookingRefund schema.
        $this->setUpBookingRefundSchema();

        // The minimal booking_mirror table is focused on the
        // payment/refund columns. Add the extra columns this test
        // exercises (extras_json, raw_json, sync timestamps,
        // prepayment/deposit, adults/children).
        foreach ([
            'extras_json'              => 'text',
            'raw_json'                 => 'text',
            'prepayment_amount'        => 'decimal',
            'prepayment_paid'          => 'boolean',
            'deposit_amount'           => 'decimal',
            'deposit_paid'             => 'boolean',
            'source_created_at'        => 'timestamp',
            'source_updated_at'        => 'timestamp',
            'synced_at'                => 'timestamp',
            'pms_sync_last_attempt_at' => 'timestamp',
            'adults'                   => 'integer',
            'children'                 => 'integer',
        ] as $col => $type) {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('booking_mirror', $col)) {
                \Illuminate\Support\Facades\Schema::table('booking_mirror', function ($t) use ($col, $type) {
                    $colDef = match ($type) {
                        'text'      => $t->text($col),
                        'decimal'   => $t->decimal($col, 12, 2)->default(0),
                        'boolean'   => $t->boolean($col)->default(false),
                        'timestamp' => $t->timestamp($col),
                        'integer'   => $t->integer($col)->default(0),
                    };
                    if (!in_array($type, ['decimal', 'boolean', 'integer'], true)) $colDef->nullable();
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

    /* ─── The 'booking_mirror' SINGULAR table-name footgun ─── */

    public function test_table_name_is_explicitly_singular_booking_mirror(): void
    {
        // CRITICAL: CLAUDE.md flags this. Two migrations shipped
        // with plural 'booking_mirrors' and failed every prod
        // deploy. This regression-guard ensures protected \$table
        // stays explicitly 'booking_mirror'.
        $model = new BookingMirror();

        $this->assertSame('booking_mirror', $model->getTable(),
            'CRITICAL: BookingMirror::table MUST be singular ("booking_mirror") — '
            . 'the documented footgun. Pluralisation broke prod deploys (commit c583ffc6).');
    }

    /* ─── IntegrationDataScope: hide when Smoobu disabled ─── */

    public function test_integration_data_scope_hides_rows_when_smoobu_disabled(): void
    {
        // Smoobu integration toggled OFF → SPA must NOT surface
        // synced mirrors. Data stays in DB; re-enable restores
        // visibility instantly.
        BookingMirrorFactory::new()->create(['reservation_id' => 'SM-001']);
        BookingMirrorFactory::new()->create(['reservation_id' => 'SM-002']);

        // Pre-condition: 2 rows visible.
        $this->assertSame(2, BookingMirror::count());

        // Disable Smoobu integration.
        HotelSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'smoobu_enabled',
            'value'           => 'false',
        ]);

        // Now: scope filters everything out.
        $this->assertSame(0, BookingMirror::count(),
            'IntegrationDataScope MUST hide rows when smoobu_enabled=false.');
    }

    public function test_withoutGlobalScope_bypasses_integration_data_scope(): void
    {
        // Diagnostic / export tools MUST be able to bypass the
        // scope. Lock the documented escape hatch.
        BookingMirrorFactory::new()->create();

        HotelSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'smoobu_enabled',
            'value'           => 'false',
        ]);

        // With scope: empty.
        $this->assertSame(0, BookingMirror::count());

        // Without scope: data still there.
        $this->assertSame(1, BookingMirror::withoutGlobalScope(IntegrationDataScope::class)->count(),
            'withoutGlobalScope(IntegrationDataScope) MUST bypass the integration filter.');
    }

    public function test_integration_scope_applies_when_smoobu_explicitly_enabled(): void
    {
        // Counter-test: enabled = rows visible.
        BookingMirrorFactory::new()->create();
        HotelSetting::create([
            'organization_id' => $this->orgId,
            'key'             => 'smoobu_enabled',
            'value'           => 'true',
        ]);

        $this->assertSame(1, BookingMirror::count());
    }

    /* ─── Money columns: decimal:2 string casts ─── */

    public function test_price_total_casts_to_decimal_2_string(): void
    {
        // CRITICAL: BCMath-safe money math downstream. Float cast
        // would surface 199.99 as 199.989999... silently — booking
        // confirm + refund arithmetic would carry the error.
        $mirror = BookingMirrorFactory::new()->create(['price_total' => 199.99]);

        $this->assertSame('199.99', $mirror->fresh()->price_total);
    }

    public function test_price_paid_casts_to_decimal_2_string(): void
    {
        $mirror = BookingMirrorFactory::new()->paid()->create([
            'price_total' => 250.00,
            'price_paid'  => 250.00,
        ]);

        $this->assertSame('250.00', $mirror->fresh()->price_paid);
    }

    public function test_refunded_amount_casts_to_decimal_2_string(): void
    {
        // The May-13 audit-fixed column. BookingRefundService
        // writes the refunded cumulative here; the BookingDetail
        // panel reads it. Float would lose precision over
        // multiple partial refunds.
        $mirror = BookingMirrorFactory::new()->paid()->create([
            'price_total'     => 500.50,
            'refunded_amount' => 175.25,
        ]);

        $this->assertSame('175.25', $mirror->fresh()->refunded_amount);
    }

    public function test_prepayment_and_deposit_amounts_cast_to_decimal_2_string(): void
    {
        // Both money columns; both BCMath-safe.
        $mirror = BookingMirrorFactory::new()->create([
            'prepayment_amount' => 50.00,
            'deposit_amount'    => 100.00,
        ]);

        $this->assertSame('50.00',  $mirror->fresh()->prepayment_amount);
        $this->assertSame('100.00', $mirror->fresh()->deposit_amount);
    }

    /* ─── Boolean gates ─── */

    public function test_prepayment_paid_and_deposit_paid_cast_to_boolean(): void
    {
        // The booking widget reads these to decide what to charge
        // at the payment step. 0/1 vs true/false matters for the
        // widget's payment-method picker logic.
        $mirror = BookingMirrorFactory::new()->create([
            'prepayment_paid' => true,
            'deposit_paid'    => false,
        ]);

        $this->assertTrue($mirror->prepayment_paid);
        $this->assertFalse($mirror->deposit_paid);
        $this->assertIsBool($mirror->prepayment_paid);
    }

    /* ─── Date + datetime casts ─── */

    public function test_arrival_and_departure_dates_cast_to_carbon(): void
    {
        // The availability checker calls ->isPast() / ->diffInDays()
        // — needs Carbon.
        $mirror = BookingMirrorFactory::new()->create([
            'arrival_date'   => '2026-07-15',
            'departure_date' => '2026-07-20',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->arrival_date);
        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->departure_date);
        $this->assertSame('2026-07-15', $mirror->arrival_date->toDateString());
    }

    public function test_refunded_at_casts_to_carbon(): void
    {
        // Drives the BookingDetail panel's "refunded at" timestamp.
        $mirror = BookingMirrorFactory::new()->refunded()->create();

        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->refunded_at);
    }

    public function test_sync_timestamps_cast_to_carbon(): void
    {
        $mirror = BookingMirrorFactory::new()->create([
            'source_created_at'         => now()->subDays(7),
            'source_updated_at'         => now()->subDays(2),
            'synced_at'                 => now()->subHour(),
            'pms_sync_last_attempt_at'  => now()->subMinutes(30),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->source_created_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->source_updated_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->synced_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $mirror->pms_sync_last_attempt_at);
    }

    /* ─── Array casts (raw_json, extras_json) ─── */

    public function test_raw_json_round_trips_through_array_cast(): void
    {
        // raw_json carries the full PMS payload for diagnostic
        // replay (DiagBookingHistory + DiagSmoobuCreateProbe both
        // read this).
        // 250.00 would collapse to int 250 after JSON round-trip;
        // use a decimal that preserves precision.
        $rawPayload = [
            'id'             => 12345678,
            'apartment'      => ['id' => 100, 'name' => 'Suite'],
            'channel'        => ['id' => 70, 'name' => 'Direct'],
            'arrival-date'   => '2026-07-01',
            'price'          => 250.75,
            'metadata'       => ['source' => 'smoobu_webhook'],
        ];

        $mirror = BookingMirrorFactory::new()->create(['raw_json' => $rawPayload]);

        $this->assertSame($rawPayload, $mirror->fresh()->raw_json);
    }

    public function test_extras_json_round_trips_through_array_cast(): void
    {
        // Use values with non-zero decimals so JSON encode/decode
        // doesn't strip them to int (.00 collapses to int — real
        // callers should treat numeric fields cautiously).
        $extras = [
            ['id' => 'breakfast', 'qty' => 2, 'price' => 30.50],
            ['id' => 'parking',   'qty' => 1, 'price' => 15.25],
        ];

        $mirror = BookingMirrorFactory::new()->create(['extras_json' => $extras]);

        $this->assertSame($extras, $mirror->fresh()->extras_json);
    }

    /* ─── Relationships ─── */

    public function test_guest_relationship_is_belongs_to(): void
    {
        $mirror = BookingMirrorFactory::new()->create();
        $rel = $mirror->guest();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    public function test_price_elements_is_has_many(): void
    {
        $mirror = BookingMirrorFactory::new()->create();
        $rel = $mirror->priceElements();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
    }
}
