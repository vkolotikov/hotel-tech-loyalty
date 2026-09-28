<?php

namespace Tests\Feature\Booking;

use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class Phase2MigrationTest extends TestCase
{
    use SetsUpMinimalSchema;

    private function migration(): object
    {
        return require base_path('database/migrations/2026_09_25_100000_member_portal_phase_2.php');
    }

    private function baseTables(): void
    {
        $this->setUpMinimalSchema();
        Schema::create('special_offers', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->string('title'); $t->string('type', 30); $t->decimal('value', 8, 2)->default(0); $t->timestamps(); });
        Schema::create('member_offers', function ($t) { $t->id(); $t->unsignedBigInteger('member_id'); $t->unsignedBigInteger('offer_id'); $t->timestamp('used_at')->nullable(); $t->string('status', 20)->default('available'); $t->timestamps(); });
        Schema::create('rewards', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('name'); $t->integer('points_cost'); $t->timestamps(); });
        Schema::create('tier_benefits', function ($t) { $t->id(); $t->unsignedBigInteger('tier_id'); $t->unsignedBigInteger('benefit_id'); $t->string('value_type', 24)->default('text'); $t->timestamps(); });
        Schema::create('service_bookings', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id'); $t->decimal('total_amount', 10, 2)->default(0); $t->string('status', 30)->default('pending'); $t->timestamps(); });
    }

    public function test_it_adds_every_phase_2_column_and_is_idempotent(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->up(); // guarded: a second run must not throw

        foreach ([
            'special_offers'  => ['code', 'applies_to'],
            'member_offers'   => ['used_reference'],
            'rewards'         => ['discount_type', 'discount_value', 'applies_to'],
            'tier_benefits'   => ['applies_to'],
            'service_bookings'=> ['list_amount', 'discount_amount', 'discount_source', 'discount_source_id', 'discount_label', 'points_awarded_at'],
        ] as $table => $cols) {
            foreach ($cols as $col) {
                $this->assertTrue(Schema::hasColumn($table, $col), "$table.$col");
            }
        }
    }

    public function test_down_removes_what_up_added_and_nothing_else(): void
    {
        $this->baseTables();
        $m = $this->migration();
        $m->up();
        $m->down();
        $this->assertFalse(Schema::hasColumn('special_offers', 'code'));
        $this->assertFalse(Schema::hasColumn('service_bookings', 'discount_amount'));
        $this->assertTrue(Schema::hasColumn('service_bookings', 'total_amount'));
        $this->assertTrue(Schema::hasColumn('member_offers', 'used_at'));
    }

    public function test_the_settings_registry_seeds_the_phase_2_rows(): void
    {
        $this->baseTables();
        Schema::create('hotel_settings', function ($t) { $t->id(); $t->unsignedBigInteger('organization_id')->nullable(); $t->string('key'); $t->text('value')->nullable(); $t->string('type', 20)->default('string'); $t->string('group', 40)->default('general'); $t->string('label')->nullable(); $t->text('description')->nullable(); $t->string('scope', 20)->default('tenant'); $t->timestamps(); });
        $org = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa']);
        app()->instance('current_organization_id', $org->id);

        $controller = new \App\Http\Controllers\Api\V1\Admin\SettingsController();
        (new \ReflectionMethod($controller, 'ensureTenantHasDefaultSettings'))->invoke($controller);

        $rows = \App\Models\HotelSetting::withoutGlobalScopes()->where('organization_id', $org->id)->pluck('value', 'key');
        $this->assertSame('false', $rows['services_require_staff_confirmation']);
        $this->assertSame('true', $rows['points_on_bookings']);
        $this->assertSame('24', $rows['services_cancel_hours']);
        $this->assertSame('48', $rows['booking_cancel_hours']);
        $this->assertSame('true', $rows['portal_enabled']);
    }
}
