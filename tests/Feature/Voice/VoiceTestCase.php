<?php

namespace Tests\Feature\Voice;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Testing\Fluent\AssertableJson;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Shared fixtures for the voice suites. Organization 1 is the connected
 * workspace and organization 2 is a foreign one that must stay unreachable.
 * Contact values are deliberately recognisable so a test can assert that a
 * spoken response never contains them.
 */
abstract class VoiceTestCase extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config([
            'voice.enabled' => true,
            'voice.organization_ids' => [1],
            'voice.medical_organization_ids' => [],
            'voice.proposal_ttl_seconds' => 120,
            'chatgpt.organization_ids' => [1],
            'chatgpt.enabled' => true,
            'chatgpt.url' => 'http://localhost',
            'app.url' => 'http://localhost',
            'app.timezone' => 'UTC',
        ]);
        URL::forceRootUrl('http://localhost');

        $this->setUpMinimalSchema();
        $this->setUpVoiceSchema();
        $this->seedVoiceFixtures();

        $this->staff = User::findOrFail(1);
        $this->actingAs($this->staff);
        app()->instance('current_organization_id', 1);
        $this->travelTo(CarbonImmutable::parse('2026-09-12 09:00:00', 'UTC'));
    }

    private function setUpVoiceSchema(): void
    {
        Schema::table('organizations', function ($t) {
            $t->string('timezone')->nullable();
            $t->timestamp('saas_deleted_at')->nullable();
        });
        Schema::table('guests', fn ($t) => $t->text('passport_no')->nullable());
        Schema::create('staff', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('user_id');
            $t->boolean('is_active')->default(true);
        });
        Schema::create('brands', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->string('name');
            $t->softDeletes();
        });
        Schema::create('brand_user', function ($t) {
            $t->unsignedBigInteger('brand_id');
            $t->unsignedBigInteger('user_id');
        });
        Schema::create('pipeline_stages', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->string('name');
            $t->string('kind');
        });
        Schema::create('inquiries', function ($t) {
            $t->id();
            $t->unsignedBigInteger('organization_id');
            $t->unsignedBigInteger('guest_id')->nullable();
            $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('pipeline_stage_id')->nullable();
            $t->string('event_name')->nullable();
            $t->string('inquiry_type')->nullable();
            $t->string('source')->nullable();
            $t->string('status')->default('New');
            $t->string('priority')->default('Medium');
            $t->text('notes')->nullable();
            $t->text('custom_data')->nullable();
            $t->date('check_in')->nullable();
            $t->date('next_task_due')->nullable();
            $t->timestamps();
        });

        Schema::dropIfExists('service_bookings');
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
    }

    private function seedVoiceFixtures(): void
    {
        DB::table('organizations')->insert([
            ['id' => 1, 'name' => 'FDS Cards UK', 'timezone' => 'Europe/Riga'],
            ['id' => 2, 'name' => 'Foreign workspace', 'timezone' => 'UTC'],
        ]);
        DB::table('users')->insert(['id' => 1, 'organization_id' => 1,
            'email' => 'staff@example.test', 'name' => 'Reception', 'user_type' => 'staff']);
        DB::table('staff')->insert(['user_id' => 1, 'organization_id' => 1]);
        DB::table('brands')->insert(['id' => 1, 'organization_id' => 1, 'name' => 'FDS Cards']);
        DB::table('pipeline_stages')->insert(
            ['id' => 1, 'organization_id' => 1, 'name' => 'Call scheduled', 'kind' => 'open']);

        // Every row needs identical keys; a batch insert with differing keys
        // fails with "all VALUES must have the same number of terms".
        DB::table('guests')->insert([
            ['id' => 1, 'organization_id' => 1, 'full_name' => 'Morgan Lee', 'company' => null,
                'email' => 'PRIVATE_EMAIL@example.test', 'phone' => 'PRIVATE_PHONE',
                'passport_no' => 'PRIVATE_PASSPORT'],
            ['id' => 2, 'organization_id' => 2, 'full_name' => 'FOREIGN_CUSTOMER', 'company' => null,
                'email' => 'FOREIGN_EMAIL@example.test', 'phone' => null, 'passport_no' => null],
        ]);

        // Two leads created today in Europe/Riga (2026-09-12 local).
        $this->lead(1, '2026-09-12 06:00:00');
        $this->lead(2, '2026-09-12 07:00:00');
        // Yesterday, so "today" must not count it.
        $this->lead(3, '2026-09-11 06:00:00');

        $this->serviceBooking(1, '2026-09-12 08:00:00', 'Morgan Lee');
    }

    protected function guest(int $id, string $fullName, array $overrides = []): void
    {
        DB::table('guests')->insert(array_merge([
            'id' => $id, 'organization_id' => 1, 'full_name' => $fullName,
            'company' => null, 'email' => null, 'phone' => null, 'passport_no' => null,
        ], $overrides));
    }

    protected function lead(int $id, string $createdAt, array $overrides = []): void
    {
        DB::table('inquiries')->insert(array_merge([
            'id' => $id, 'organization_id' => 1, 'guest_id' => 1, 'brand_id' => 1,
            'pipeline_stage_id' => 1, 'status' => 'New', 'priority' => 'Medium',
            'created_at' => $createdAt, 'updated_at' => $createdAt,
        ], $overrides));
    }

    protected function serviceBooking(int $id, string $startAt, string $customer, array $overrides = []): void
    {
        DB::table('service_bookings')->insert(array_merge([
            'id' => $id, 'organization_id' => 1, 'guest_id' => 1, 'brand_id' => 1,
            'customer_name' => $customer, 'customer_email' => 'PRIVATE_EMAIL@example.test',
            'start_at' => $startAt, 'end_at' => $startAt,
            'status' => 'confirmed', 'payment_status' => 'paid',
            'total_amount' => 4500, 'currency' => 'EUR',
            'created_at' => $startAt, 'updated_at' => $startAt,
        ], $overrides));
    }

    protected function data($response): array
    {
        $data = [];
        $response->assertStructuredContent(function (AssertableJson $json) use (&$data) {
            $data = $json->toArray();
            $json->etc();
        });

        return $data;
    }
}
