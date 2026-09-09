<?php

namespace Tests\Feature\ChatGptTools;

use App\Mcp\Servers\HexaTechServer;
use App\Mcp\Tools\AddBookingNote;
use App\Mcp\Tools\AddCustomerNote;
use App\Mcp\Tools\GetBooking;
use App\Mcp\Tools\GetCustomer;
use App\Mcp\Tools\ListBookings;
use App\Mcp\Tools\SearchCustomers;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\Fluent\AssertableJson;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class CustomerBookingToolsTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private User $staff;

    private const REQUEST_ID = '9133341b-c7da-4126-a6cb-fc302bdb170b';

    protected function setUp(): void
    {
        parent::setUp();
        config(['chatgpt.organization_ids' => [1, 2]]);
        Http::preventStrayRequests();
        Mail::fake();
        $this->setUpBookingAdminSchema();
        Schema::table('organizations', function ($t) {
            $t->string('timezone')->nullable();
            $t->string('currency')->nullable();
            $t->timestamp('saas_deleted_at')->nullable();
        });
        Schema::table('guests', function ($t) {
            $t->text('passport_no')->nullable();
            $t->timestamp('last_activity_at')->nullable();
        });
        Schema::create('staff', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('user_id');
            $t->string('role')->default('receptionist');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('brands', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->string('name');
            $t->timestamps();
            $t->softDeletes();
        });
        Schema::create('brand_user', function ($t) {
            $t->unsignedBigInteger('user_id');
            $t->unsignedBigInteger('brand_id');
            $t->string('role')->nullable();
            $t->timestamps();
        });
        Schema::create('guest_activities', function ($t) {
            $t->id();
            $t->unsignedBigInteger('guest_id');
            $t->string('type');
            $t->text('description');
            $t->string('performed_by')->nullable();
            $t->timestamps();
        });
        Schema::create('reservations', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('guest_id')->nullable();
            $t->unsignedBigInteger('property_id')->nullable();
            $t->string('confirmation_no')->nullable();
            $t->string('room_number')->nullable();
            $t->date('check_in');
            $t->date('check_out');
            $t->string('status')->default('Confirmed');
            $t->string('payment_status')->default('Unpaid');
            $t->decimal('total_amount')->default(0);
            $t->text('notes')->nullable();
            $t->timestamps();
        });
        Schema::create('service_bookings', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('guest_id')->nullable();
            $t->unsignedBigInteger('service_id')->nullable();
            $t->unsignedBigInteger('service_master_id')->nullable();
            $t->string('booking_reference')->nullable();
            $t->string('customer_name')->nullable();
            $t->string('customer_email')->nullable();
            $t->timestamp('start_at');
            $t->timestamp('end_at');
            $t->string('status')->default('confirmed');
            $t->string('payment_status')->default('unpaid');
            $t->decimal('total_amount')->default(0);
            $t->string('currency')->default('EUR');
            $t->text('staff_notes')->nullable();
            $t->string('stripe_payment_intent_id')->nullable();
            $t->text('meta')->nullable();
            $t->timestamps();
        });
        Schema::table('booking_mirror', function ($t) {
            $t->unsignedBigInteger('guest_id')->nullable();
            $t->text('raw_json')->nullable();
            $t->string('guest_app_url')->nullable();
        });
        Schema::table('booking_price_elements', function ($t) {
            $t->string('currency_code', 3)->nullable();
        });
        DB::table('organizations')->insert([
            ['id' => 1, 'name' => 'Connected organization', 'is_active' => true, 'timezone' => 'Europe/Riga', 'currency' => 'EUR'],
            ['id' => 2, 'name' => 'Other organization', 'is_active' => true, 'timezone' => 'UTC', 'currency' => 'GBP'],
        ]);
        DB::table('users')->insert(['id' => 1, 'organization_id' => 1, 'email' => 'staff@example.test',
            'name' => 'Reception', 'user_type' => 'staff']);
        DB::table('staff')->insert(['id' => 1, 'organization_id' => 1, 'user_id' => 1]);
        $this->staff = User::findOrFail(1);
        $this->actingAs($this->staff);
        app()->instance('current_organization_id', 1);
    }

    public function test_customer_search_is_tenant_scoped_bounded_and_does_not_serialize_sensitive_fields(): void
    {
        $this->guest(1, 1, 'Alice One');
        $this->guest(2, 1, 'Alice Two');
        $this->guest(3, 2, 'Alice Foreign');
        $response = HexaTechServer::tool(SearchCustomers::class, ['query' => 'alice', 'limit' => 1]);
        $response->assertOk()->assertSee('Alice One')->assertDontSee(['Alice Two', 'Alice Foreign', 'PASSPORT_SECRET', 'passport_masked']);
        $this->assertSame(1, $this->data($response)['next_after_id']);
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'alice', 'limit' => 1, 'after_id' => 1])
            ->assertOk()->assertSee('Alice Two')->assertDontSee('Alice Foreign');
    }

    public function test_search_treats_wildcards_as_literal_characters(): void
    {
        $this->guest(1, 1, '100% Customer');
        $this->guest(2, 1, '1000 Customer');
        HexaTechServer::tool(SearchCustomers::class, ['query' => '100%'])
            ->assertOk()->assertSee('100% Customer')->assertDontSee('1000 Customer');
    }

    public function test_customer_details_hide_foreign_ids_and_bound_note_history(): void
    {
        $this->guest(1, 1, 'Alice');
        $this->guest(2, 2, 'Other Tenant');
        for ($id = 1; $id <= 11; $id++) {
            DB::table('guest_activities')->insert(['guest_id' => 1, 'type' => 'note', 'description' => str_repeat('a', 2100)]);
        }
        DB::table('guest_activities')->insert(['guest_id' => 1, 'type' => 'email', 'description' => 'PRIVATE_EMAIL_BODY']);
        $response = HexaTechServer::tool(GetCustomer::class, ['customer_id' => 1]);
        $response->assertOk()->assertDontSee(['PASSPORT_SECRET', 'PRIVATE_EMAIL_BODY']);
        $data = $this->data($response);
        $this->assertCount(10, $data['notes']);
        $this->assertTrue($data['has_more_notes']);
        $this->assertTrue($data['notes'][0]['body_truncated']);
        $this->assertSame(2000, mb_strlen($data['notes'][0]['body']));
        HexaTechServer::tool(GetCustomer::class, ['customer_id' => 2])->assertHasErrors()->assertDontSee('Other Tenant');
    }

    public function test_validation_rejects_unbounded_ranges_pages_and_organization_override(): void
    {
        foreach ([['query' => 'aa', 'limit' => 26], ['query' => ' '], ['query' => 'aa', 'organization_id' => 2]] as $args) {
            HexaTechServer::tool(SearchCustomers::class, $args)->assertHasErrors();
        }
        foreach ([['from' => '2026-01-01', 'to' => '2026-12-31'], ['from' => '2026-02-01', 'to' => '2026-01-01'],
            ['page' => 101], ['from' => 'not-a-date']] as $args) {
            HexaTechServer::tool(ListBookings::class, ['kind' => 'reservation', ...$args])->assertHasErrors();
        }
    }

    public function test_missing_or_mismatched_tenant_and_missing_staff_fail_closed(): void
    {
        app()->forgetInstance('current_organization_id');
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
        app()->instance('current_organization_id', 2);
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
        app()->instance('current_organization_id', 1);
        DB::table('staff')->delete();
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
    }

    public function test_member_and_inactive_organization_cannot_use_tools(): void
    {
        $this->staff->user_type = 'member';
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
        $this->staff->user_type = 'staff';
        DB::table('organizations')->where('id', 1)->update(['is_active' => false]);
        $this->staff->unsetRelation('organization');
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
    }

    public function test_disabled_staff_deleted_organization_and_unauthenticated_requests_fail_closed(): void
    {
        DB::table('staff')->where('id', 1)->update(['is_active' => false]);
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
        DB::table('staff')->where('id', 1)->update(['is_active' => true]);
        DB::table('organizations')->where('id', 1)->update(['saas_deleted_at' => now()]);
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
        auth()->logout();
        HexaTechServer::tool(SearchCustomers::class, ['query' => 'aa'])->assertHasErrors();
    }

    public function test_archived_brand_assignment_does_not_turn_into_unrestricted_access(): void
    {
        $this->reservation(1, 1, 1);
        DB::table('brands')->insert(['id' => 1, 'organization_id' => 1, 'name' => 'Archived', 'deleted_at' => now()]);
        DB::table('brand_user')->insert(['user_id' => 1, 'brand_id' => 1]);
        $result = HexaTechServer::tool(ListBookings::class, ['kind' => 'reservation', 'from' => '2026-09-01', 'to' => '2026-09-30']);
        $result->assertOk();
        $this->assertSame([], $this->data($result)['bookings']);
    }

    public function test_bookings_respect_all_assigned_brands_and_tenant_for_reads_and_writes(): void
    {
        foreach ([1, 2, 3] as $id) {
            DB::table('brands')->insert(['id' => $id, 'organization_id' => 1, 'name' => 'Brand '.$id]);
            $this->reservation($id, 1, $id);
            $this->service($id, 1, $id);
        }
        DB::table('brand_user')->insert([['user_id' => 1, 'brand_id' => 1], ['user_id' => 1, 'brand_id' => 2]]);
        $this->reservation(4, 2, 1);
        foreach (['reservation', 'service'] as $kind) {
            $result = HexaTechServer::tool(ListBookings::class, ['kind' => $kind, 'from' => '2026-09-01', 'to' => '2026-09-30']);
            $result->assertOk();
            $this->assertSame([1, 2], array_column($this->data($result)['bookings'], 'id'));
            HexaTechServer::tool(GetBooking::class, ['kind' => $kind, 'booking_id' => 3])->assertHasErrors();
            HexaTechServer::tool(AddBookingNote::class, ['kind' => $kind, 'booking_id' => 3,
                'body' => 'Must not be saved', 'request_id' => self::REQUEST_ID])->assertHasErrors();
        }
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_booking_dates_and_pages_are_inclusive_and_service_dates_use_org_timezone(): void
    {
        $this->service(1, 1, null, '2026-09-08 21:30:00'); // September 9 in Riga.
        $this->service(2, 1, null, '2026-09-09 20:59:00');
        $this->service(3, 1, null, '2026-09-09 21:01:00'); // September 10 in Riga.
        $args = ['kind' => 'service', 'from' => '2026-09-09', 'to' => '2026-09-09', 'limit' => 1];
        $result = HexaTechServer::tool(ListBookings::class, $args);
        $result->assertOk();
        $this->assertSame([1], array_column($this->data($result)['bookings'], 'id'));
        $this->assertSame(2, $this->data($result)['next_page']);
        $second = HexaTechServer::tool(ListBookings::class, [...$args, 'page' => 2]);
        $this->assertSame([2], array_column($this->data($second)['bookings'], 'id'));
        $this->assertNull($this->data($second)['next_page']);
    }

    public function test_room_bookings_keep_integration_visibility_and_omit_provider_secrets(): void
    {
        $this->room(1, 1);
        $this->room(2, 2);
        $result = HexaTechServer::tool(ListBookings::class, ['kind' => 'room', 'from' => '2026-09-01', 'to' => '2026-09-30']);
        $result->assertOk()->assertDontSee(['PROVIDER_SECRET', 'MANAGEMENT_SECRET']);
        $this->assertSame([1], array_column($this->data($result)['bookings'], 'id'));
        HexaTechServer::tool(GetBooking::class, ['kind' => 'room', 'booking_id' => 2])->assertHasErrors();
        DB::table('hotel_settings')->insert(['organization_id' => 1, 'key' => 'smoobu_enabled', 'value' => 'false']);
        HexaTechServer::tool(GetBooking::class, ['kind' => 'room', 'booking_id' => 1])->assertHasErrors();
    }

    public function test_booking_page_limit_reports_truncation_without_an_unusable_next_page(): void
    {
        for ($id = 1; $id <= 101; $id++) {
            $this->reservation($id, 1, null);
        }
        $args = ['kind' => 'reservation', 'from' => '2026-09-09', 'to' => '2026-09-09', 'limit' => 1];
        $beforeLimit = HexaTechServer::tool(ListBookings::class, [...$args, 'page' => 99]);
        $beforeLimit->assertOk();
        $this->assertSame(100, $this->data($beforeLimit)['next_page']);
        $this->assertFalse($this->data($beforeLimit)['results_truncated']);

        $atLimit = HexaTechServer::tool(ListBookings::class, [...$args, 'page' => 100]);
        $atLimit->assertOk();
        $data = $this->data($atLimit);
        $this->assertSame([100], array_column($data['bookings'], 'id'));
        $this->assertNull($data['next_page']);
        $this->assertTrue($data['results_truncated']);
        $this->assertStringContainsString('Narrow the date range or search', $data['truncation_message']);

        DB::table('reservations')->where('id', 101)->delete();
        $complete = HexaTechServer::tool(ListBookings::class, [...$args, 'page' => 100]);
        $complete->assertOk();
        $this->assertNull($this->data($complete)['next_page']);
        $this->assertFalse($this->data($complete)['results_truncated']);
        $this->assertNull($this->data($complete)['truncation_message']);
    }

    public function test_room_currency_uses_tenant_scoped_persisted_prices_and_is_unknown_when_unreliable(): void
    {
        DB::table('organizations')->where('id', 1)->update(['currency' => 'USD']);
        foreach ([1, 2, 3, 4, 5] as $id) {
            $this->room($id, 1);
        }
        DB::table('booking_price_elements')->insert([
            ['organization_id' => 1, 'booking_mirror_id' => 1, 'currency_code' => 'EUR'],
            ['organization_id' => 1, 'booking_mirror_id' => 1, 'currency_code' => 'eur'],
            // An incorrectly linked foreign row must neither set nor conflict with currency.
            ['organization_id' => 2, 'booking_mirror_id' => 1, 'currency_code' => 'USD'],
            ['organization_id' => 2, 'booking_mirror_id' => 2, 'currency_code' => 'USD'],
            ['organization_id' => 1, 'booking_mirror_id' => 3, 'currency_code' => 'EUR'],
            ['organization_id' => 1, 'booking_mirror_id' => 3, 'currency_code' => 'GBP'],
            ['organization_id' => 1, 'booking_mirror_id' => 4, 'currency_code' => 'EUR'],
            ['organization_id' => 1, 'booking_mirror_id' => 4, 'currency_code' => null],
            ['organization_id' => 1, 'booking_mirror_id' => 5, 'currency_code' => '?'],
        ]);
        $list = HexaTechServer::tool(ListBookings::class, ['kind' => 'room', 'from' => '2026-09-09', 'to' => '2026-09-09']);
        $list->assertOk();
        $this->assertSame(['EUR', null, null, null, null], array_column($this->data($list)['bookings'], 'currency'));
        foreach ([1 => 'EUR', 2 => null, 3 => null, 4 => null, 5 => null] as $id => $currency) {
            $detail = HexaTechServer::tool(GetBooking::class, ['kind' => 'room', 'booking_id' => $id]);
            $detail->assertOk();
            $this->assertSame($currency, $this->data($detail)['booking']['currency']);
        }
    }

    public function test_reservation_currency_stays_unknown_and_service_currency_comes_from_the_booking(): void
    {
        DB::table('organizations')->where('id', 1)->update(['currency' => 'USD']);
        $this->reservation(1, 1, null);
        $this->service(1, 1, null);
        DB::table('service_bookings')->where('id', 1)->update(['currency' => 'GBP']);
        foreach (['reservation' => null, 'service' => 'GBP'] as $kind => $currency) {
            $list = HexaTechServer::tool(ListBookings::class, ['kind' => $kind, 'from' => '2026-09-09', 'to' => '2026-09-09']);
            $list->assertOk();
            $this->assertSame($currency, $this->data($list)['bookings'][0]['currency']);
            $detail = HexaTechServer::tool(GetBooking::class, ['kind' => $kind, 'booking_id' => 1]);
            $detail->assertOk();
            $this->assertSame($currency, $this->data($detail)['booking']['currency']);
        }
    }

    public function test_customer_note_is_idempotent_audited_and_never_sends_messages(): void
    {
        $this->guest(1, 1, 'Alice');
        $args = ['customer_id' => 1, 'body' => 'Please call after 3pm', 'request_id' => self::REQUEST_ID];
        HexaTechServer::tool(AddCustomerNote::class, $args)->assertOk();
        $retry = HexaTechServer::tool(AddCustomerNote::class, $args);
        $retry->assertOk();
        $this->assertTrue($this->data($retry)['replayed']);
        $this->assertDatabaseCount('guest_activities', 1);
        $this->assertDatabaseCount('audit_logs', 1);
        $this->assertNotNull(DB::table('guests')->where('id', 1)->value('last_activity_at'));
        HexaTechServer::tool(AddCustomerNote::class, [...$args, 'body' => 'Different text'])->assertHasErrors();
        $this->assertDatabaseCount('guest_activities', 1);
        HexaTechServer::tool(GetCustomer::class, ['customer_id' => 1])->assertOk()->assertSee('Please call after 3pm');
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Http::assertNothingSent();
    }

    public function test_booking_notes_append_and_replay_without_changing_booking_state(): void
    {
        $this->reservation(1, 1, null);
        $this->service(1, 1, null);
        $this->room(1, 1);
        foreach (['reservation', 'service', 'room'] as $kind) {
            $args = ['kind' => $kind, 'booking_id' => 1, 'body' => 'Late arrival requested', 'request_id' => self::REQUEST_ID];
            HexaTechServer::tool(AddBookingNote::class, $args)->assertOk();
            HexaTechServer::tool(AddBookingNote::class, $args)->assertOk();
            HexaTechServer::tool(GetBooking::class, ['kind' => $kind, 'booking_id' => 1])->assertOk()->assertSee('Late arrival requested');
        }
        $this->assertDatabaseCount('audit_logs', 3);
        $this->assertDatabaseCount('booking_notes', 1);
        $notes = DB::table('reservations')->value('notes');
        $this->assertStringContainsString('Original reservation note', $notes);
        $this->assertSame(1, substr_count($notes, 'Late arrival requested'));
        $this->assertSame('Confirmed', DB::table('reservations')->value('status'));
        $this->assertSame('confirmed', DB::table('service_bookings')->value('status'));
        $this->assertSame('confirmed', DB::table('booking_mirror')->value('booking_state'));
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Http::assertNothingSent();
    }

    public function test_failed_audit_rolls_back_customer_note_and_foreign_customer_write_is_rejected(): void
    {
        $this->guest(1, 1, 'Alice');
        $this->guest(2, 2, 'Foreign');
        HexaTechServer::tool(AddCustomerNote::class, ['customer_id' => 2, 'body' => 'No', 'request_id' => self::REQUEST_ID])->assertHasErrors();
        // Fail the audit INSERT after the note and last-activity write have run,
        // proving the transaction actually rolls both changes back.
        DB::unprepared("CREATE TRIGGER fail_chatgpt_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT, 'Test audit failure'); END");
        HexaTechServer::tool(AddCustomerNote::class, ['customer_id' => 1, 'body' => 'No', 'request_id' => self::REQUEST_ID])->assertHasErrors();
        $this->assertDatabaseCount('guest_activities', 0);
        $this->assertNull(DB::table('guests')->where('id', 1)->value('last_activity_at'));
    }

    public function test_tool_descriptors_correctly_declare_oauth_and_write_effects(): void
    {
        foreach ([SearchCustomers::class, GetCustomer::class, ListBookings::class, GetBooking::class, AddCustomerNote::class, AddBookingNote::class] as $tool) {
            $definition = (new $tool)->toArray();
            $isRead = ! in_array($tool, [AddCustomerNote::class, AddBookingNote::class], true);
            $this->assertSame($isRead, $definition['annotations']['readOnlyHint']);
            $this->assertFalse($definition['annotations']['destructiveHint']);
            $this->assertFalse($definition['annotations']['openWorldHint']);
            $this->assertTrue($definition['annotations']['idempotentHint']);
            $this->assertSame([['type' => 'oauth2', 'scopes' => ['mcp:use']]], $definition['securitySchemes']);
            $this->assertFalse($definition['inputSchema']['additionalProperties']);
        }
    }

    private function guest(int $id, int $org, string $name): void
    {
        DB::table('guests')->insert(['id' => $id, 'organization_id' => $org, 'full_name' => $name,
            'email' => 'guest'.$id.'@example.test', 'passport_no' => 'PASSPORT_SECRET']);
    }

    private function data($response): array
    {
        $data = [];
        $response->assertStructuredContent(function (AssertableJson $json) use (&$data) {
            $data = $json->toArray();
            $json->etc();
        });

        return $data;
    }

    private function reservation(int $id, int $org, ?int $brand): void
    {
        DB::table('reservations')->insert(['id' => $id, 'organization_id' => $org, 'brand_id' => $brand,
            'confirmation_no' => 'RES-'.$id, 'check_in' => '2026-09-09', 'check_out' => '2026-09-10',
            'notes' => 'Original reservation note']);
    }

    private function service(int $id, int $org, ?int $brand, string $start = '2026-09-09 10:00:00'): void
    {
        DB::table('service_bookings')->insert(['id' => $id, 'organization_id' => $org, 'brand_id' => $brand,
            'booking_reference' => 'SVC-'.$id, 'start_at' => $start, 'end_at' => $start,
            'customer_name' => 'Appointment Customer', 'staff_notes' => 'Original service note',
            'stripe_payment_intent_id' => 'PAYMENT_SECRET', 'meta' => '{"token":"PROVIDER_SECRET"}']);
    }

    private function room(int $id, int $org): void
    {
        DB::table('booking_mirror')->insert(['id' => $id, 'organization_id' => $org,
            'booking_reference' => 'ROOM-'.$id, 'reservation_id' => 'external-'.$id,
            'arrival_date' => '2026-09-09', 'departure_date' => '2026-09-10', 'booking_state' => 'confirmed',
            'raw_json' => '{"token":"PROVIDER_SECRET"}', 'guest_app_url' => 'https://example.test/MANAGEMENT_SECRET']);
    }
}
