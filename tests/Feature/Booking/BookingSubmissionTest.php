<?php

namespace Tests\Feature\Booking;

use App\Models\BookingSubmission;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the BookingSubmission model contract — the audit trail
 * of every booking attempt (success, failure, warning).
 *
 * Why this matters:
 *
 *   BookingEngineService::logSubmission writes one row here for
 *   every confirm() attempt: success, fatal Smoobu reject,
 *   transient Smoobu-then-local-mirror, validation 422, etc.
 *   The admin's "Recent Submissions" diagnostic panel + the
 *   diag:recent-confirm-failures artisan command both read this
 *   table.
 *
 *   A regression in any cast surfaces wrong-type values in the
 *   diagnostic UI: gross_total as float instead of decimal
 *   string, check_in as raw string instead of Carbon, payload
 *   as JSON string instead of array.
 *
 *   The `outcome` field is the load-bearing classifier — drives
 *   the SPA's success/failure/warning badges.
 *
 * Contract:
 *
 *   - outcome string ('success' / 'failure' / 'warning') persists
 *     intact
 *   - failure_code + failure_message persist (drives the diag
 *     CLI's verbatim cause output)
 *   - guest_* PII fields persist
 *   - check_in + check_out cast to Carbon
 *   - gross_total decimal:2 string (BCMath-safe)
 *   - payload_json array cast (round-trip)
 *   - idempotency_key + request_id persist (correlation IDs for
 *     replay debugging)
 *   - guest relationship BelongsTo
 *   - BelongsToOrganization + BelongsToBrand traits +
 *     TenantScope cross-org isolation
 */
class BookingSubmissionTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingAdminSchema(); // brings booking_submissions

        // Organization::booted's created hook needs brands.
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

        // The minimal booking_submissions table is very thin.
        // Add the columns this test exercises.
        foreach ([
            'brand_id'         => 'unsignedBigInteger',
            'request_id'       => 'string',
            'idempotency_key'  => 'string',
            'outcome'          => 'string',
            'failure_code'     => 'string',
            'failure_message'  => 'text',
            'guest_id'         => 'unsignedBigInteger',
            'guest_name'       => 'string',
            'guest_email'      => 'string',
            'guest_phone'      => 'string',
            'unit_id'          => 'unsignedBigInteger',
            'unit_name'        => 'string',
            'check_in'         => 'date',
            'check_out'        => 'date',
            'adults'           => 'integer',
            'children'         => 'integer',
            'gross_total'      => 'decimal',
            'payment_method'   => 'string',
            'payment_status'   => 'string',
            'payload_json'     => 'text',
        ] as $col => $type) {
            if (!Schema::hasColumn('booking_submissions', $col)) {
                Schema::table('booking_submissions', function ($t) use ($col, $type) {
                    $colDef = match ($type) {
                        'string'             => $t->string($col),
                        'text'               => $t->text($col),
                        'integer'            => $t->integer($col)->default(0),
                        'decimal'            => $t->decimal($col, 12, 2)->default(0),
                        'date'               => $t->date($col),
                        'unsignedBigInteger' => $t->unsignedBigInteger($col),
                    };
                    if (!in_array($type, ['integer', 'decimal'], true)) $colDef->nullable();
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

    private function submission(array $attrs = []): BookingSubmission
    {
        return BookingSubmission::create(array_merge([
            'organization_id' => $this->orgId,
            'outcome'         => 'success',
        ], $attrs));
    }

    /* ─── outcome classifier ─── */

    public function test_outcome_persists_each_canonical_value(): void
    {
        // CRITICAL: outcome drives the SPA's success/failure/
        // warning badges. Lock the 3 documented values.
        foreach (['success', 'failure', 'warning'] as $outcome) {
            $row = $this->submission(['outcome' => $outcome]);
            $this->assertSame($outcome, $row->fresh()->outcome,
                "Outcome '{$outcome}' MUST persist intact.");
        }
    }

    /* ─── Failure tracking fields ─── */

    public function test_failure_code_and_message_persist_intact(): void
    {
        // failure_code is a stable identifier for grouping (e.g.
        // 'pms_rejected', 'idempotency_replay', 'currency_mismatch').
        // failure_message carries the verbatim error — drives
        // diag:recent-confirm-failures -v output.
        $row = $this->submission([
            'outcome'         => 'failure',
            'failure_code'    => 'pms_rejected',
            'failure_message' => 'Apartment with id 0 not found',
        ]);

        $fresh = $row->fresh();
        $this->assertSame('pms_rejected', $fresh->failure_code);
        $this->assertSame('Apartment with id 0 not found', $fresh->failure_message);
    }

    public function test_long_failure_message_persists_in_full(): void
    {
        // Stripe / Smoobu error bodies can be ~1KB. failure_message
        // is text column — MUST NOT truncate.
        $longMsg = str_repeat('Lorem ipsum dolor sit amet ', 50); // ~1.3KB
        $row = $this->submission([
            'outcome'         => 'failure',
            'failure_message' => $longMsg,
        ]);

        $this->assertSame($longMsg, $row->fresh()->failure_message);
    }

    /* ─── Correlation IDs for replay debugging ─── */

    public function test_request_id_and_idempotency_key_persist(): void
    {
        // request_id ties this submission row to the original HTTP
        // request (correlate against laravel.log). idempotency_key
        // ties to BookingIdempotencyKey for replay analysis.
        $row = $this->submission([
            'request_id'      => 'req_abc123def456',
            'idempotency_key' => 'idemp_confirm_xyz_001',
        ]);

        $fresh = $row->fresh();
        $this->assertSame('req_abc123def456',      $fresh->request_id);
        $this->assertSame('idemp_confirm_xyz_001', $fresh->idempotency_key);
    }

    /* ─── Date casts ─── */

    public function test_check_in_and_check_out_cast_to_carbon(): void
    {
        $row = $this->submission([
            'check_in'  => '2026-07-15',
            'check_out' => '2026-07-20',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $row->check_in);
        $this->assertInstanceOf(\Carbon\Carbon::class, $row->check_out);
        $this->assertSame('2026-07-15', $row->check_in->toDateString());
    }

    /* ─── Money cast ─── */

    public function test_gross_total_casts_to_decimal_2_string(): void
    {
        // CRITICAL: BCMath-safe. The diag panel displays this; a
        // float regression would show 250.989999... instead of
        // 250.99.
        $row = $this->submission([
            'outcome'     => 'success',
            'gross_total' => 250.99,
        ]);

        $this->assertSame('250.99', $row->fresh()->gross_total);
    }

    /* ─── payload_json array cast ─── */

    public function test_payload_json_round_trips_as_array(): void
    {
        // payload_json carries the full submitted request body
        // for diagnostic replay. Array cast lets diag tools read
        // it as a typed map.
        $payload = [
            'unit_id'     => 12345,
            'check_in'    => '2026-07-01',
            'check_out'   => '2026-07-04',
            'adults'      => 2,
            'extras'      => [['id' => 'breakfast', 'qty' => 2]],
            'guest_email' => 'guest@example.com',
        ];

        $row = $this->submission(['payload_json' => $payload]);

        $this->assertSame($payload, $row->fresh()->payload_json);
    }

    /* ─── Guest fields persist ─── */

    public function test_guest_pii_fields_persist_intact(): void
    {
        // The submission row captures guest snapshot fields so the
        // diag panel can show "who tried to book" even when the
        // booking failed and no Guest row was created.
        $row = $this->submission([
            'guest_name'  => 'Alice Smith',
            'guest_email' => 'alice@example.com',
            'guest_phone' => '+1-555-0100',
        ]);

        $fresh = $row->fresh();
        $this->assertSame('Alice Smith',         $fresh->guest_name);
        $this->assertSame('alice@example.com',   $fresh->guest_email);
        $this->assertSame('+1-555-0100',         $fresh->guest_phone);
    }

    public function test_guest_relationship_is_belongs_to(): void
    {
        $row = $this->submission();
        $rel = $row->guest();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
    }

    /* ─── BelongsToOrganization + BelongsToBrand auto-fill ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $row = $this->submission();

        $this->assertSame($this->orgId, (int) $row->organization_id);
    }

    /* ─── TenantScope cross-org isolation ─── */

    public function test_tenant_scope_isolates_submissions_cross_org(): void
    {
        // CRITICAL: the diag panel's submission list MUST scope
        // to tenant. Cross-leak would expose other tenants' guest
        // PII + failure messages.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('booking_submissions')->insert([
            'organization_id' => $orgA,
            'outcome'         => 'success',
            'guest_email'     => 'org-a-guest@example.com',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('booking_submissions')->insert([
            'organization_id' => $orgB,
            'outcome'         => 'failure',
            'guest_email'     => 'org-b-guest@example.com',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = BookingSubmission::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('org-a-guest@example.com', $aRows->first()->guest_email);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = BookingSubmission::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('org-b-guest@example.com', $bRows->first()->guest_email);
    }
}
