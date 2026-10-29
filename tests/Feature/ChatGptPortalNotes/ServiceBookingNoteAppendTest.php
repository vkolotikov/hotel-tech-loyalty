<?php

namespace Tests\Feature\ChatGptPortalNotes;

use App\Http\Controllers\Api\V1\Admin\ServiceBookingController;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\ClearsTheMigrationsOrganisation;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class ServiceBookingNoteAppendTest extends TestCase
{
    use ClearsTheMigrationsOrganisation, DatabaseTransactions, SetsUpMinimalSchema;

    private function auditCount(): int
    {
        return DB::table('audit_logs')->whereIn('organization_id', [1, 2])->where('action', 'service_booking.updated')->count();
    }

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        $this->setUpBookingRefundSchema();
        // Only where the database lacks them: one built from every migration has both.
        if (!Schema::hasTable('service_bookings')) Schema::create('service_bookings', function ($table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->unsignedBigInteger('service_id')->nullable();
            $table->unsignedBigInteger('service_master_id')->nullable();
            $table->string('booking_reference');
            $table->string('status')->default('pending');
            $table->string('payment_status')->default('unpaid');
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancellation_reason')->nullable();
            $table->text('staff_notes')->nullable();
            // NOT NULL in production (see serviceBookingRequired()).
            $table->string('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->timestamp('start_at')->nullable();
            $table->timestamp('end_at')->nullable();
            $table->integer('duration_minutes')->nullable();
            $table->timestamps();
        });
        if (!Schema::hasTable('services')) Schema::create('services', function ($table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('brand_id')->nullable();
            $table->string('name');
            $table->timestamps();
        });
        if (!Schema::hasTable('service_booking_extras')) Schema::create('service_booking_extras', function ($table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('service_booking_id');
        });
        $this->clearTheMigrationsOrganisation(); // this test owns organisation 1
        DB::table('organizations')->insert(['id' => 1, 'name' => 'Test workspace', 'slug' => 'test-workspace']);
        DB::table('users')->insert(['id' => 1, 'organization_id' => 1, 'name' => 'Reception',
            'email' => 'reception@example.test', 'password' => bcrypt('unused-password'), 'user_type' => 'staff']);
        $this->actingAs(User::findOrFail(1));

        // Exercise the actual controller and tenant/staff middleware with a
        // local SQLite fixture, without contacting subscription services.
        Route::patch('/_test/service-bookings/{id}/status', [ServiceBookingController::class, 'updateStatus'])
            ->middleware(['tenant', 'admin']);
        // A booking is always for a service (service_id is NOT NULL in production).
        $serviceId = DB::table('services')->insertGetId(['organization_id' => 1, 'name' => 'Quiet room massage',
            'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert($this->serviceBookingRequired(['id' => 1, 'organization_id' => 1, 'service_id' => $serviceId,
            'brand_id' => 10, 'booking_reference' => 'SVC-NOTE-TEST',
            'staff_notes' => '[2026-09-09 via ChatGPT] Quiet room requested.']));
    }

    public function test_portal_append_preserves_latest_notes_and_updates_other_fields(): void
    {
        $existing = DB::table('service_bookings')->where('id', 1)->value('staff_notes');
        // Another writer adds a note after the portal fetched its detail page.
        $latest = $existing."\n\nAnother staff member confirmed the request.";
        DB::table('service_bookings')->where('id', 1)->update(['staff_notes' => $latest]);

        $this->patchJson('/_test/service-bookings/1/status', [
            'append_staff_note' => 'Customer will arrive at 10:00.',
            'status' => 'confirmed',
        ])->assertOk()->assertJsonPath('staff_notes', $latest."\n\nCustomer will arrive at 10:00.")
            ->assertJsonPath('status', 'confirmed');
        $this->assertSame(1, $this->auditCount());
    }

    public function test_additive_notes_can_exceed_the_old_replacement_field_limit_without_losing_history(): void
    {
        $existing = str_repeat('Existing note. ', 200);
        DB::table('service_bookings')->where('id', 1)->update(['staff_notes' => $existing]);
        $this->patchJson('/_test/service-bookings/1/status', ['append_staff_note' => 'New note.'])
            ->assertOk()->assertJsonPath('staff_notes', $existing."\n\nNew note.");
    }

    public function test_legacy_explicit_replacement_still_works(): void
    {
        $this->patchJson('/_test/service-bookings/1/status', ['staff_notes' => 'Replacement note.'])
            ->assertOk()->assertJsonPath('staff_notes', 'Replacement note.');
    }

    public function test_status_only_and_blank_append_leave_notes_unchanged(): void
    {
        $existing = DB::table('service_bookings')->where('id', 1)->value('staff_notes');
        $this->patchJson('/_test/service-bookings/1/status', ['status' => 'confirmed'])
            ->assertOk()->assertJsonPath('staff_notes', $existing);
        $this->patchJson('/_test/service-bookings/1/status', ['append_staff_note' => '  '])
            ->assertOk()->assertJsonPath('staff_notes', $existing);
    }

    public function test_append_to_empty_notes_has_no_leading_separator(): void
    {
        DB::table('service_bookings')->where('id', 1)->update(['staff_notes' => null]);
        $this->patchJson('/_test/service-bookings/1/status', ['append_staff_note' => 'First note.'])
            ->assertOk()->assertJsonPath('staff_notes', 'First note.');
    }

    public function test_ambiguous_and_oversized_requests_do_not_change_notes_or_status(): void
    {
        $existing = DB::table('service_bookings')->where('id', 1)->value('staff_notes');
        $this->patchJson('/_test/service-bookings/1/status', [
            'staff_notes' => 'Replace', 'append_staff_note' => 'Append', 'status' => 'confirmed',
        ])->assertUnprocessable()->assertJsonValidationErrors(['staff_notes', 'append_staff_note']);
        $this->patchJson('/_test/service-bookings/1/status', [
            'append_staff_note' => str_repeat('a', 2001), 'status' => 'confirmed',
        ])->assertUnprocessable()->assertJsonValidationErrors('append_staff_note');
        $this->assertDatabaseHas('service_bookings', ['id' => 1, 'staff_notes' => $existing, 'status' => 'pending']);
        $this->assertSame(0, $this->auditCount());
    }

    public function test_append_cannot_cross_the_existing_tenant_or_brand_scope(): void
    {
        $this->organisationsExist([2]);
        DB::table('service_bookings')->insert($this->serviceBookingRequired(['id' => 2, 'organization_id' => 2,
            'brand_id' => 10, 'booking_reference' => 'SVC-OTHER-TENANT', 'staff_notes' => 'Private.']));
        $this->patchJson('/_test/service-bookings/2/status', ['append_staff_note' => 'Forbidden'])
            ->assertNotFound();

        app()->instance('current_brand_id', 20);
        $this->patchJson('/_test/service-bookings/1/status', ['append_staff_note' => 'Forbidden'])
            ->assertNotFound();
        $this->assertDatabaseHas('service_bookings', ['id' => 2, 'staff_notes' => 'Private.']);
        $this->assertSame(0, $this->auditCount());
    }
}
