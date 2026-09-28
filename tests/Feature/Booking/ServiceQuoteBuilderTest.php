<?php

namespace Tests\Feature\Booking;

use App\Models\ServiceExtra;
use App\Services\Booking\ExtraLeadTimeException;
use App\Services\Booking\ServiceQuoteBuilder;
use App\Services\Booking\SlotTakenException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class ServiceQuoteBuilderTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpServiceBookingSchema();
        $this->orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'numa'])->id;
        app()->instance('current_organization_id', $this->orgId);
    }

    private function nextMonday(): string
    {
        return now()->next('Monday')->setTime(10, 0)->toIso8601String();
    }

    public function test_it_prices_the_service_with_the_master_override_and_extras(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        DB::table('service_master_service')->where('service_id', $service->id)->where('service_master_id', $master->id)->update(['price_override' => 70]);
        $extra = ServiceExtra::create(['organization_id' => $this->orgId, 'name' => 'Hot towel', 'price' => 5, 'price_type' => 'per_person', 'is_active' => true]);

        $q = app(ServiceQuoteBuilder::class)->build($service, $master->id, $this->nextMonday(), 2, [['id' => $extra->id, 'quantity' => 1]]);

        $this->assertSame(70.0, $q['service_price']);
        $this->assertSame(10.0, $q['extras'][0]['line_total']);   // per person × party 2
        $this->assertSame(10.0, $q['extras_total']);
        $this->assertSame(80.0, $q['list_total']);
        $this->assertSame('EUR', $q['currency']);
        $this->assertSame(45, $q['duration_minutes']);
        $this->assertSame($master->id, $q['master']->id);
    }

    public function test_an_extra_needing_more_lead_time_than_the_slot_allows_is_refused(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $extra = ServiceExtra::create(['organization_id' => $this->orgId, 'name' => 'Cake', 'price' => 20, 'price_type' => 'flat', 'lead_time_hours' => 24 * 30, 'is_active' => true]);

        $this->expectException(ExtraLeadTimeException::class);
        app(ServiceQuoteBuilder::class)->build($service, $master->id, $this->nextMonday(), 1, [['id' => $extra->id, 'quantity' => 1]]);
    }

    public function test_a_taken_slot_throws_the_scheduler_error(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        $start = now()->next('Monday')->setTime(10, 0);
        DB::table('service_bookings')->insert(['organization_id' => $this->orgId, 'booking_reference' => 'SVC-TAKEN001', 'service_id' => $service->id, 'service_master_id' => $master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => $start, 'end_at' => $start->copy()->addMinutes(45), 'duration_minutes' => 45, 'service_price' => 60, 'extras_total' => 0, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'widget', 'created_at' => now(), 'updated_at' => now()]);

        $this->expectException(SlotTakenException::class);
        app(ServiceQuoteBuilder::class)->build($service, $master->id, $start->toIso8601String());
    }

    public function test_the_public_quote_endpoint_prices_through_the_builder(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        \App\Models\Organization::whereKey($this->orgId)->update(['widget_token' => 'wt-quote-test']);
        app()->forgetInstance('current_organization_id');

        $res = $this->postJson('/api/v1/services/quote?org=wt-quote-test', ['service_id' => $service->id, 'service_master_id' => $master->id, 'start_at' => $this->nextMonday(), 'party_size' => 1]);

        $res->assertOk()->assertJsonPath('total_amount', 60)->assertJsonPath('service.id', $service->id)->assertJsonPath('extras_total', 0);
    }

    /** Widget parity (Task 2 review, revisited in Task 10): the widget's own quote endpoint answers 422 for an extra whose lead time cannot be met, same as the portal's. */
    public function test_the_public_quote_endpoint_answers_422_for_an_extra_needing_more_lead_time(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        \App\Models\Organization::whereKey($this->orgId)->update(['widget_token' => 'wt-quote-lead-test']);
        app()->forgetInstance('current_organization_id');
        $extra = ServiceExtra::create(['organization_id' => $this->orgId, 'name' => 'Cake', 'price' => 20, 'price_type' => 'flat', 'lead_time_hours' => 24 * 30, 'is_active' => true]);

        $res = $this->postJson('/api/v1/services/quote?org=wt-quote-lead-test', [
            'service_id' => $service->id, 'service_master_id' => $master->id, 'start_at' => $this->nextMonday(), 'party_size' => 1,
            'extras' => [['id' => $extra->id, 'quantity' => 1]],
        ]);

        $res->assertStatus(422);
    }

    /** Widget parity: the widget's own quote endpoint answers 409 for a slot another booking already holds, same as the portal's. */
    public function test_the_public_quote_endpoint_answers_409_for_a_taken_slot(): void
    {
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->orgId);
        \App\Models\Organization::whereKey($this->orgId)->update(['widget_token' => 'wt-quote-taken-test']);
        app()->forgetInstance('current_organization_id');
        $start = now()->next('Monday')->setTime(10, 0);
        DB::table('service_bookings')->insert(['organization_id' => $this->orgId, 'booking_reference' => 'SVC-TAKEN002', 'service_id' => $service->id, 'service_master_id' => $master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => $start, 'end_at' => $start->copy()->addMinutes(45), 'duration_minutes' => 45, 'service_price' => 60, 'extras_total' => 0, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'widget', 'created_at' => now(), 'updated_at' => now()]);

        $res = $this->postJson('/api/v1/services/quote?org=wt-quote-taken-test', [
            'service_id' => $service->id, 'service_master_id' => $master->id, 'start_at' => $start->toIso8601String(), 'party_size' => 1,
        ]);

        $res->assertStatus(409);
    }
}
